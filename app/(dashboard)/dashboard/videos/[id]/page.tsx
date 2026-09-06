import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { getProject } from '@/lib/projects';
import { VideoError } from '@/lib/videos';
import { getStoryboard } from '@/lib/storyboard';
import { isLlmConfigured } from '@/lib/llm/deepseek';
import { isVoiceConfigured } from '@/lib/voice/elevenlabs';
import { DeleteVideoButton, StoryboardEditor } from './storyboard';
import { VideoSettings } from '@/components/storyboard/video-settings';
import { listSounds } from '@/lib/sounds';
import { listClientAssets } from '@/lib/assets';
import { createAssetStore } from '@/lib/storage';
import { QUALITY_LABEL } from '@/lib/credits/pricing';
import { GxPage, GxFil, GxNotice } from '@/components/gx/gx-page';
import { EtatBadge } from '@/components/gx/gx-etat';

/** Le temps qu'une lecture tient : assez pour regarder, pas pour partager. */
const LECTURE_TTL_S = 60 * 60;

const PIPELINE_LABEL: Record<string, string> = {
  image: 'images fixes',
  video: 'plans animés',
  mixed: 'mixte',
};

/**
 * L'adresse de lecture du montage.
 *
 * `outputUrl` est une clé R2, pas une URL : le navigateur ne peut pas la lire
 * telle quelle. On la signe pour une heure, et on rend `null` si le magasin
 * n'est pas configuré — une instance sans R2 doit afficher la page, pas
 * tomber.
 */
async function lienDuMontage(cle: string | null): Promise<string | null> {
  if (!cle) return null;
  try {
    return await createAssetStore().signedUrl(cle, LECTURE_TTL_S);
  } catch {
    return null;
  }
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const { id } = await params;
  const tdb = tenantDb(user.tenantId);

  let board;
  try {
    board = await getStoryboard(tdb, Number(id));
  } catch (error) {
    if (error instanceof VideoError) notFound();
    throw error;
  }

  const montage = await lienDuMontage(board.video.outputUrl);
  const project = await getProject(tdb, board.video.projectId);
  const brouillon = board.video.status === 'draft';

  // Le catalogue est partagé entre tous les projets : il ne passe pas par le
  // scope tenant. Lu ici plutôt que dans le composant, qui est client.
  const musics = brouillon
    ? (await listSounds('music')).map((sound) => ({
        key: sound.src,
        name: sound.name,
        mood: sound.mood,
      }))
    : [];
  const pipeline = board.video.pipelineOverride ?? project.defaultPipeline;

  /*
   * Les fichiers déposés sur le projet, pour pouvoir les servir sur un plan.
   *
   * Ils vivent sur le **projet** et pas sur la vidéo : un client dépose ses
   * quinze captures une fois et en tire plusieurs montages. Chargés seulement
   * pour un brouillon — après validation les crédits sont débités, et lier un
   * fichier ne rembourserait rien.
   */
  const apports = brouillon ? await listClientAssets(tdb, project.id) : [];

  return (
    <GxPage className="max-w-6xl">
      <GxFil
        parent={project.name}
        parentHref={`/dashboard/projects/${project.id}`}
        courant={board.video.title}
      />

      <header className="mb-8">
        <p className="t-label text-marque">Vidéo</p>
        <h1 className="t-h2 mt-3">{board.video.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <EtatBadge status={board.video.status} />
          <span className="t-data text-xs text-paper-3">
            {QUALITY_LABEL[board.video.quality]} · {board.video.ratio} ·{' '}
            {PIPELINE_LABEL[pipeline] ?? pipeline}
          </span>
        </div>
        <div aria-hidden="true" className="mire mt-6 h-[3px] w-24" />
      </header>

      <div className="space-y-4">
        {!isLlmConfigured() && brouillon && (
          <GxNotice tone="erreur">
            La clé <code className="font-mono">DEEPSEEK_API_KEY</code> manque sur cette instance :
            la génération est indisponible. Les scènes restent éditables à la main.
          </GxNotice>
        )}

        {board.shots.length > 0 && !board.durationsMeasured && brouillon && !isVoiceConfigured() && (
          <GxNotice tone="erreur">
            La clé <code className="font-mono">ELEVENLABS_API_KEY</code> manque : la voix off ne
            peut pas être enregistrée. Sans elle, le prix reste une estimation et la vidéo ne peut
            pas être validée.
          </GxNotice>
        )}
      </div>

      {/* Le montage d'abord : quand il existe, c'est ce qu'on vient voir. */}
      {montage && (
        <section className="plate-hi mt-6 overflow-hidden">
          <div aria-hidden="true" className="mire h-[3px]" />
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <p className="t-label text-marque">Le montage</p>
            <p className="t-data text-xs text-paper-3">{board.video.ratio}</p>
          </div>
          <div className="p-5">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={montage} controls playsInline className="w-full rounded-lg bg-ink" />
            <p className="mt-3 text-xs text-paper-3">
              Le lien de lecture vaut une heure. Refaites le montage pour le renouveler.
            </p>
          </div>
        </section>
      )}

      {board.video.theme && (
        <section className="plate mt-6 p-5">
          <p className="t-label text-paper-3">Le sujet</p>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-paper-2">
            {board.video.theme}
          </p>
        </section>
      )}

      <div className="mt-6">
        <StoryboardEditor
          video={board.video}
          shots={board.shots}
          creditsEstimated={board.creditsEstimated}
          balance={board.balance}
          canAfford={board.canAfford}
          durationsMeasured={board.durationsMeasured}
          assets={apports}
        />
      </div>

      {brouillon && (
        <div className="mt-8 space-y-4">
          <section className="plate p-6">
            <h2 className="font-display text-lg font-bold tracking-tight">Réglages de rendu</h2>
            <p className="mt-1 text-sm text-paper-3">
              Format, sous-titres et musique. Modifiables tant que la vidéo est un brouillon.
            </p>
            <div className="mt-5">
              <VideoSettings
                videoId={board.video.id}
                quality={QUALITY_LABEL[board.video.quality]}
                ratio={board.video.ratio}
                subtitleStyle={board.video.subtitleStyle}
                musicUrl={board.video.musicUrl}
                musics={musics}
              />
            </div>
          </section>

          <section className="rounded-lg border border-rouge/40 bg-rouge/5 p-6">
            <h2 className="font-display text-lg font-bold tracking-tight text-danger">
              Supprimer la vidéo
            </h2>
            <p className="mt-2 text-sm text-paper-2">
              Le storyboard et les scènes partent avec. Rien n’a encore été débité sur un
              brouillon, mais la suppression est définitive.
            </p>
            <div className="mt-5">
              <DeleteVideoButton videoId={board.video.id} projectId={project.id} />
            </div>
          </section>
        </div>
      )}
    </GxPage>
  );
}
