import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Film, Clock, Coins, AlertTriangle, CheckCircle2, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { getUser } from '@/lib/db/queries';
import { tenantDb, eq } from '@/lib/db/tenant-db';
import { projects, shots } from '@/lib/db/schema';
import { listVideos } from '@/lib/videos';

const ETATS = [
  { value: 'all', label: 'Toutes' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'validated', label: 'Validées' },
  { value: 'generating', label: 'En fabrication' },
  { value: 'rendering', label: 'Montage' },
  { value: 'rendered', label: 'Terminées' },
  { value: 'published', label: 'Publiées' },
  { value: 'failed', label: 'Échouées' },
] as const;

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-secondary text-muted-foreground border',
  validated: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  generating: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  rendering: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  rendered: 'bg-green-500/15 text-green-400 border border-green-500/30',
  published: 'bg-green-500/15 text-green-400 border border-green-500/30',
  failed: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

function Vignette({ status }: { status: string }) {
  const isPublished = status === 'published' || status === 'rendered';
  const isFailed = status === 'failed';
  const isGenerating = status === 'generating' || status === 'rendering' || status === 'validated';
  return (
    <div
      className={`flex aspect-video w-full items-center justify-center rounded-md border ${isPublished ? 'border-green-500/30 bg-green-500/10' : isFailed ? 'border-red-500/30 bg-red-500/10' : isGenerating ? 'border-amber-500/30 bg-amber-500/10' : 'border-dashed bg-muted/40'}`}
    >
      {isPublished ? (
        <Play className="size-6 text-green-400" />
      ) : isFailed ? (
        <AlertTriangle className="size-6 text-red-400" />
      ) : isGenerating ? (
        <Film className="size-6 animate-pulse text-amber-400" />
      ) : (
        <Film className="size-6 text-muted-foreground/60" />
      )}
    </div>
  );
}

export default async function VideosLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  const tdb = tenantDb(user.tenantId);
  const { etat } = await searchParams;
  const filtre = ETATS.some((e) => e.value === etat) ? (etat as string) : 'all';

  const [allVideos, allProjects] = await Promise.all([listVideos(tdb), tdb.findMany(projects)]);
  const projectById = new Map(allProjects.map((p) => [p.id, p.name]));

  const filtered =
    filtre === 'all' ? allVideos : allVideos.filter((v) => v.status === filtre);

  // enrichir avec durée (somme des scènes) quand il y a des vidéos
  const withMeta = await Promise.all(
    filtered.map(async (video) => {
      const shotList = await tdb.findMany(shots, eq(shots.videoId, video.id));
      const duree = shotList.reduce((t, s) => t + (s.durationS ?? 0), 0);
      return { video, duree, scenes: shotList.length };
    })
  );
  withMeta.sort((a, b) => b.video.updatedAt.getTime() - a.video.updatedAt.getTime());

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-brand-accent uppercase">Vidéos</p>
          <h1 className="text-2xl font-semibold tracking-tight">Bibliothèque</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vignette, durée, coût, date, plateforme — filtrez par état.
          </p>
        </div>
        <Link href="/dashboard/projects" className={buttonVariants({ size: 'sm' })}>
          Nouvelle vidéo
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {ETATS.map((e) => {
          const active = filtre === e.value;
          return (
            <Link
              key={e.value}
              href={e.value === 'all' ? '/dashboard/videos' : `/dashboard/videos?etat=${e.value}`}
              className={
                active
                  ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80'
              }
            >
              {e.label}
              {e.value !== 'all' && (
                <span className="ml-1.5 tabular-nums opacity-70">
                  {allVideos.filter((v) => v.status === e.value).length}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {withMeta.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Film />
                </EmptyMedia>
                <EmptyTitle>
                  {filtre === 'all' ? 'Aucune vidéo' : `Aucune vidéo : ${ETATS.find((e) => e.value === filtre)?.label}`}
                </EmptyTitle>
                <EmptyDescription>
                  {filtre === 'all'
                    ? 'Vos vidéos apparaîtront ici — avec leur vignette, leur durée et leur coût.'
                    : 'Essayez un autre filtre, ou créez une nouvelle vidéo.'}
                </EmptyDescription>
              </EmptyHeader>
              {filtre !== 'all' && (
                <Link href="/dashboard/videos" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  Voir toutes
                </Link>
              )}
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {withMeta.map(({ video, duree, scenes }) => (
            <Link key={video.id} href={`/dashboard/videos/${video.id}`} className="group">
              <Card className="overflow-hidden transition-colors group-hover:border-primary/40">
                <div className="p-2">
                  <Vignette status={video.status} />
                </div>
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-medium leading-tight group-hover:text-primary">{video.title}</h3>
                    <Badge className={`shrink-0 text-[10px] capitalize ${STATUS_BADGE[video.status] ?? 'bg-secondary text-muted-foreground border'}`}>
                      {video.status}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{projectById.get(video.projectId) ?? 'Projet'}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {duree > 0 ? `${duree.toFixed(1).replace('.', ',')} s` : '—'}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Coins className="size-3" />
                      {video.creditsConsumed > 0 ? `${video.creditsConsumed}` : `${video.creditsEstimated || '—'}`} cr
                    </span>
                    <span>·</span>
                    <span>{scenes} scène{scenes !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(video.updatedAt).toLocaleDateString('fr-FR')}</span>
                    <span className="inline-flex items-center gap-1">
                      {video.youtubeVideoId ? (
                        <>
                          <CheckCircle2 className="size-3 text-green-500" /> YouTube
                        </>
                      ) : video.outputUrl ? (
                        'MP4 prêt'
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
