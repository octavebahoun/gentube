import { eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { shots, type Video } from '@/lib/db/schema';
import { estimateVideo } from '@/lib/credits';
import { getProject } from '@/lib/projects';
import { assertDraft, getVideo } from '@/lib/videos';
import {
  assetKey,
  createAssetStore,
  type AssetStore,
} from '@/lib/storage';
import {
  MEASURING_PROVIDER,
  createDeliveryVoiceClient,
  createMeasuringVoiceClient,
  deliveryProviderFor,
  type VoiceSynthesizer,
} from '@/lib/voice';
import {
  StoryboardError,
  getStoryboard,
  listShots,
  type StoryboardView,
} from './service';

/**
 * L'étape voix off — là où un storyboard cesse d'être une estimation.
 *
 * Elle tourne AVANT les visuels coûteux et avant tout paiement, volontairement
 * : la parole est bon marché (des centimes pour mille caractères, contre un
 * prix par clip pour la vidéo), et c'est le seul moyen de savoir combien de
 * temps une scène dure réellement. Le montant sur le bouton de validation est
 * alors le montant débité, exactement.
 *
 * Deux propriétés comptent plus que la vitesse ici :
 *
 *  - **Reprise possible.** Chaque scène est écrite dès qu'elle réussit. Un
 *    échec à mi-chemin laisse les scènes finies mesurées, et un second
 *    passage les saute au lieu de payer deux fois le fournisseur pour la
 *    même ligne.
 *  - **Séquentiel.** Les scènes sont synthétisées une par une. Une douzaine de
 *    requêtes parallèles irait plus vite et serait aussi le moyen le plus
 *    rapide de prendre un 429 sur un fournisseur que nous ne contrôlons pas.
 */

export type VoiceoverResult = StoryboardView & {
  /** Scènes doublées par ce passage. Les scènes déjà mesurées ne comptent pas. */
  voiced: number;
  skipped: number;
};

export async function generateVoiceover(
  tdb: TenantDb,
  videoId: number,
  {
    client,
    store,
  }: { client?: VoiceSynthesizer; store?: AssetStore } = {}
): Promise<VoiceoverResult> {
  const video = await getVideo(tdb, videoId);
  assertDraft(video);

  const project = await getProject(tdb, video.projectId);
  const storyboard = await listShots(tdb, videoId);

  const speakable = storyboard.filter((shot) => shot.narration?.trim());
  if (speakable.length === 0) {
    throw new Error('No scene has a line to read yet.');
  }

  // Résolus paresseusement : une vidéo dont toutes les scènes sont déjà
  // mesurées ne doit pas échouer juste parce que les clés fournisseur
  // manquent.
  let synthesizer = client;
  let assets = store;

  let voiced = 0;
  let skipped = 0;

  for (const shot of speakable) {
    if (shot.durationSource === 'measured' && shot.audioUrl) {
      skipped += 1;
      continue;
    }

    // Edge TTS, et pas la voix du plan : cette passe parle avant que le client
    // ait payé quoi que ce soit, y compris pour les devis qui n'aboutissent pas.
    synthesizer ??= createMeasuringVoiceClient();
    assets ??= createAssetStore();

    const voiceover = await synthesizer.synthesize(
      shot.narration!,
      video.voice ?? project.voiceId
    );

    // Plan de nommage : docs/contrats.md §3 —
    // `<tenant>/videos/<video>/voice/scene-<ordre>.mp3`. L'ordre, pas l'id :
    // une scène déplacée garde son fichier, le storyboard dit quel fichier va où.
    const key = await assets.put(
      assetKey(
        tdb.tenantId,
        'videos',
        String(videoId),
        'voice',
        `scene-${shot.order}.mp3`
      ),
      voiceover.audio,
      voiceover.contentType
    );

    await tdb.update(
      shots,
      {
        audioUrl: key,
        words: voiceover.words,
        durationS: voiceover.durationS,
        durationSource: 'measured',
        voiceProvider: MEASURING_PROVIDER,
        updatedAt: new Date(),
      },
      eq(shots.id, shot.id)
    );

    voiced += 1;
  }

  // Le prix suit l'audio : ré-estimer ici est ce qui transforme les durées
  // mesurées en nombre exact affiché sur le bouton de validation.
  await estimateVideo(tdb, videoId);

  return { ...(await getStoryboard(tdb, videoId)), voiced, skipped };
}

/**
 * Statuts depuis lesquels on accepte de livrer la voix du plan.
 *
 * `draft` est refusé et c'est le cœur du dispositif : rien n'a encore été
 * débité, et faire parler Polly ou ElevenLabs à ce stade, ce serait payer un
 * devis. `rendered` est refusé aussi — remplacer la voix d'une vidéo déjà
 * livrée changerait le fichier sous un client qui l'a peut-être publiée.
 */
const DELIVERABLE = new Set(['validated', 'generating', 'rendering']);

export function assertPaid(video: Video): void {
  if (DELIVERABLE.has(video.status)) return;

  throw new StoryboardError(
    video.status === 'draft'
      ? 'This video is still a draft: nothing has been charged yet, so the ' +
        'delivery voice would be paid for a quote.'
      : `This video is ${video.status}; its voice-over can no longer be replaced.`,
    409
  );
}

/**
 * La passe de livraison — la voix que le client a payée.
 *
 * Elle rejoue chaque narration avec le fournisseur du plan et **écrase** le
 * fichier de la passe de mesure : même clé R2, donc rien d'autre à mettre à
 * jour. Les timings mot à mot sont refaits eux aussi, sans quoi les sous-titres
 * karaoké suivraient une voix qui n'est plus là.
 *
 * **Le prix ne bouge pas.** Il a été calculé sur les durées d'Edge TTS et
 * débité à la validation, une fois, avec une clé d'idempotence. Si la voix
 * livrée dure un peu plus longtemps, la durée de scène monte pour que le
 * renderer ne coupe pas un mot — mais la facture, elle, est écrite. L'écart est
 * pour nous.
 *
 * La durée ne **descend** jamais : une vidéo plus courte que celle qui a été
 * payée serait une livraison en deçà de la commande.
 */
export async function finalizeVoiceover(
  tdb: TenantDb,
  videoId: number,
  {
    client,
    store,
  }: { client?: VoiceSynthesizer; store?: AssetStore } = {}
): Promise<VoiceoverResult> {
  const video = await getVideo(tdb, videoId);
  assertPaid(video);

  const project = await getProject(tdb, video.projectId);
  const storyboard = await listShots(tdb, videoId);

  const speakable = storyboard.filter((shot) => shot.narration?.trim());
  if (speakable.length === 0) {
    throw new Error('No scene has a line to read yet.');
  }

  // Le plan est lu une fois : il décide et du fournisseur à construire, et du
  // nom auquel comparer les scènes déjà livrées.
  const plan = (await tdb.getTenant())?.plan;
  const target = deliveryProviderFor(plan);

  let synthesizer = client;
  let assets = store;

  let voiced = 0;
  let skipped = 0;

  for (const shot of speakable) {
    // Reprise : une scène déjà livrée par ce fournisseur ne se repaie pas.
    if (shot.voiceProvider === target && shot.audioUrl) {
      skipped += 1;
      continue;
    }

    synthesizer ??= createDeliveryVoiceClient(plan);
    assets ??= createAssetStore();

    const voiceover = await synthesizer.synthesize(
      shot.narration!,
      video.voice ?? project.voiceId
    );

    const key = await assets.put(
      assetKey(
        tdb.tenantId,
        'videos',
        String(videoId),
        'voice',
        `scene-${shot.order}.mp3`
      ),
      voiceover.audio,
      voiceover.contentType
    );

    await tdb.update(
      shots,
      {
        audioUrl: key,
        words: voiceover.words,
        durationS: Math.max(shot.durationS, voiceover.durationS),
        voiceProvider: target,
        updatedAt: new Date(),
      },
      eq(shots.id, shot.id)
    );

    voiced += 1;
  }

  // Aucun appel à `estimateVideo` ici, volontairement : la vidéo est payée, et
  // ré-estimer réécrirait le chiffre que le client a vu sur son bouton.
  return { ...(await getStoryboard(tdb, videoId)), voiced, skipped };
}
