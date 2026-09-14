import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, Coins, Film, Youtube } from 'lucide-react';
import { ButtonLink } from '@/components/kit/button';
import { Empty } from '@/components/kit/badge';
import { TabLinks } from '@/components/kit/tabs';
import { Page, PageHeader } from '@/components/kit/page';
import { Vignette } from '@/components/kit/vignette';
import { EtatBadge, ETAT_LABEL } from '@/components/kit/etat';
import { seconds } from '@/components/storyboard/utils';
import { getUser } from '@/lib/db/queries';
import { tenantDb, eq } from '@/lib/db/tenant-db';
import { projects, shots } from '@/lib/db/schema';
import { listVideos } from '@/lib/videos';
import { liensDeLecture } from '@/lib/storage/lecture';

const ETATS = [
  'all',
  'draft',
  'validated',
  'generating',
  'rendering',
  'rendered',
  'published',
  'failed',
] as const;

export default async function VideosLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  const tdb = tenantDb(user.tenantId);
  const { etat } = await searchParams;
  const filtre: string = ETATS.includes(etat as (typeof ETATS)[number]) ? (etat as string) : 'all';

  const [allVideos, allProjects] = await Promise.all([listVideos(tdb), tdb.findMany(projects)]);
  const projectById = new Map(allProjects.map((p) => [p.id, p.name]));

  const filtered = filtre === 'all' ? allVideos : allVideos.filter((v) => v.status === filtre);

  const withMeta = await Promise.all(
    filtered.map(async (video) => {
      const shotList = await tdb.findMany(shots, eq(shots.videoId, video.id));
      const duree = shotList.reduce((t, s) => t + (s.durationS ?? 0), 0);
      return { video, duree, scenes: shotList.length };
    })
  );
  withMeta.sort((a, b) => b.video.updatedAt.getTime() - a.video.updatedAt.getTime());

  // `outputUrl` est une clé de bucket : la vignette la recevait telle quelle
  // et ne montrait donc jamais le montage. Voir lib/storage/lecture.
  const montages = await liensDeLecture(
    withMeta.map(({ video }) => [video.id, video.outputUrl])
  );

  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow="Vidéos"
        titre="Bibliothèque"
        intro="Chaque vidéo avec sa durée, son coût et son état. Survolez une vidéo terminée pour la voir tourner."
        action={
          <ButtonLink href="/dashboard/projects" size="sm">
            Nouvelle vidéo
          </ButtonLink>
        }
      />

      <TabLinks
        className="mb-5"
        active={filtre}
        tabs={ETATS.map((e) => ({
          href: `/dashboard/videos?etat=${e}`,
          label: e === 'all' ? 'Toutes' : ETAT_LABEL[e],
          count: e === 'all' ? allVideos.length : allVideos.filter((v) => v.status === e).length,
        }))}
      />

      {withMeta.length === 0 ? (
        <Empty
          icon={<Film aria-hidden="true" />}
          title={filtre === 'all' ? 'Aucune vidéo' : `Aucune vidéo dans « ${ETAT_LABEL[filtre]} »`}
          hint={
            filtre === 'all'
              ? 'Vos vidéos apparaîtront ici avec leur aperçu, leur durée et leur coût.'
              : 'Essayez un autre état, ou lancez une nouvelle vidéo depuis un projet.'
          }
          action={
            filtre === 'all' ? (
              <ButtonLink href="/dashboard/projects">Choisir un projet</ButtonLink>
            ) : (
              <ButtonLink href="/dashboard/videos?etat=all" variant="secondary">
                Voir toutes les vidéos
              </ButtonLink>
            )
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {withMeta.map(({ video, duree, scenes }) => (
            <li key={video.id}>
              <Link
                href={`/dashboard/videos/${video.id}`}
                className="block overflow-hidden rounded-card border border-line bg-surface transition-colors duration-(--t-fast) hover:border-line-strong"
              >
                <Vignette status={video.status} src={montages[video.id]} titre={video.title} />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 text-sm leading-snug font-semibold text-ink">
                      {video.title}
                    </h2>
                    <EtatBadge status={video.status} className="shrink-0" />
                  </div>

                  <p className="truncate text-xs text-ink-3">
                    {projectById.get(video.projectId) ?? 'Projet'}
                  </p>

                  <div className="t-data flex flex-wrap items-center gap-3 text-xs text-ink-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {duree > 0 ? seconds(duree) : '—'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Coins className="size-3.5" aria-hidden="true" />
                      {video.creditsConsumed > 0
                        ? `${video.creditsConsumed} crédits`
                        : video.creditsEstimated > 0
                          ? `${video.creditsEstimated} crédits`
                          : '—'}
                    </span>
                    <span>
                      {scenes} scène{scenes !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="t-data flex items-center justify-between border-t border-line pt-3 text-xs text-ink-3">
                    <span>{new Date(video.updatedAt).toLocaleDateString('fr-FR')}</span>
                    <span className="inline-flex items-center gap-1.5">
                      {video.youtubeVideoId ? (
                        <>
                          <Youtube className="size-3.5 text-ok" aria-hidden="true" /> Sur YouTube
                        </>
                      ) : video.outputUrl ? (
                        <span className="text-ok">MP4 prêt</span>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
