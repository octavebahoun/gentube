import { eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { shots } from '@/lib/db/schema';
import { estimateVideo } from '@/lib/credits';
import { getProject } from '@/lib/projects';
import { assertDraft, getVideo } from '@/lib/videos';
import {
  assetKey,
  createAssetStore,
  type AssetStore,
} from '@/lib/storage';
import {
  createVoiceClient,
  type VoiceSynthesizer,
} from '@/lib/voice/elevenlabs';
import { getStoryboard, listShots, type StoryboardView } from './service';

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
 *    passage les saute au lieu de payer deux fois ElevenLabs pour la même
 *    ligne.
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

    synthesizer ??= createVoiceClient();
    assets ??= createAssetStore();

    const voiceover = await synthesizer.synthesize(
      shot.narration!,
      video.voice ?? project.voiceId
    );

    const key = await assets.put(
      assetKey(tdb.tenantId, 'videos', String(videoId), `scene-${shot.id}.mp3`),
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
