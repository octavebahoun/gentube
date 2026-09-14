import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PlusCircle } from 'lucide-react';
import { ButtonLink } from '@/components/kit/button';
import { Tabs } from '@/components/kit/tabs';
import { Page, PageHeader, Breadcrumb } from '@/components/kit/page';
import { EtatBadge } from '@/components/kit/etat';
import { Empty } from '@/components/kit/badge';
import { Film } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { ProjectError, getProject } from '@/lib/projects';
import { listVideos } from '@/lib/videos';
import { listClientAssets } from '@/lib/assets';
import { DeleteProjectButton, EditProjectForm } from '../project-form';
import { AssetUploader } from './asset-uploader';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const { id } = await params;

  let project;
  try {
    project = await getProject(tenantDb(user.tenantId), Number(id));
  } catch (error) {
    // L'id d'un autre tenant et un id inconnu atterrissent ici de la même
    // façon, c'est le but : la page ne peut pas servir à sonder ce qui existe.
    if (error instanceof ProjectError) notFound();
    throw error;
  }

  const canDelete = user.role === 'owner' || user.role === 'admin';
  const videos = await listVideos(tenantDb(user.tenantId), project.id);
  const assets = await listClientAssets(tenantDb(user.tenantId), project.id);

  return (
    <Page>
      <Breadcrumb parent="Projets" parentHref="/dashboard/projects" courant={project.name} />
      <PageHeader
        eyebrow="Projet"
        titre={project.name}
        action={
          <ButtonLink href={`/dashboard/projects/${project.id}/videos/new`} size="sm">
            <PlusCircle className="size-4" aria-hidden="true" />
            Nouvelle vidéo
          </ButtonLink>
        }
      />

      <Tabs
        defaultValue="videos"
        tabs={[
          { value: 'videos', label: 'Vidéos', count: videos.length },
          { value: 'fichiers', label: 'Vos fichiers', count: assets.length },
          { value: 'reglages', label: 'Réglages' },
        ]}
        panels={{
          videos: (
            <div className="mt-5">
              {videos.length === 0 ? (
                <Empty
                  icon={<Film aria-hidden="true" />}
                  title="Aucune vidéo dans ce projet"
                  hint="Partez d’un sujet : le storyboard reprendra le style défini dans les réglages."
                  action={
                    <ButtonLink href={`/dashboard/projects/${project.id}/videos/new`}>
                      Créer la première vidéo
                    </ButtonLink>
                  }
                />
              ) : (
                <ul className="grid grid-cols-1 gap-2.5">
                  {videos.map((video) => (
                    <li key={video.id}>
                      <Link
                        href={`/dashboard/videos/${video.id}`}
                        className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 transition-colors duration-(--t-fast) hover:border-line-strong"
                      >
                        <span className="min-w-0 truncate text-sm font-semibold text-ink">
                          {video.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="t-data text-xs text-ink-3">
                            {video.creditsConsumed > 0
                              ? `${video.creditsConsumed} cr débités`
                              : `${video.creditsEstimated} cr estimés`}
                          </span>
                          <EtatBadge status={video.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
          fichiers: (
            <div className="mt-5 rounded-card border border-line bg-surface p-4 sm:p-5">
              <h2 className="t-h3 text-ink">Vos fichiers</h2>
              <p className="mt-1 text-sm text-ink-2">
                Les fichiers déposés ici remplacent la génération sur les scènes où vous les
                choisissez. Vous ne payez que ce qui reste à créer.
              </p>
              <div className="mt-5">
                <AssetUploader projectId={project.id} assets={assets} />
              </div>
            </div>
          ),
          reglages: (
            <div className="mt-5 space-y-4">
              <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
                <h2 className="t-h3 text-ink">Configuration</h2>
                <p className="mt-1 text-sm text-ink-2">
                  Le style et la voix que chaque nouvelle vidéo reprendra.
                </p>
                <div className="mt-5">
                  <EditProjectForm project={project} />
                </div>
              </div>

              <section className="rounded-card border border-bad/40 bg-bad/5 p-4 sm:p-5">
                <h2 className="t-h3 text-bad">Supprimer le projet</h2>
                <p className="mt-2 text-sm text-ink-2">
                  Un projet qui contient des vidéos ne peut pas être supprimé : ces vidéos
                  portent des crédits et des liens YouTube. Videz-le d’abord.
                </p>
                <div className="mt-5">
                  <DeleteProjectButton projectId={project.id} canDelete={canDelete} />
                </div>
              </section>
            </div>
          ),
        }}
      />
    </Page>
  );
}
