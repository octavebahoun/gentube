import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PlusCircle } from 'lucide-react';
import { GxButton } from '@/components/gx/gx-button';
import { GxTabs } from '@/components/gx/gx-tabs';
import { GxPage, GxPageHeader, GxFil } from '@/components/gx/gx-page';
import { EtatBadge } from '@/components/gx/gx-etat';
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
    <GxPage>
      <GxFil parent="Projets" parentHref="/dashboard/projects" courant={project.name} />
      <GxPageHeader
        eyebrow="Projet"
        titre={project.name}
        action={
          <GxButton href={`/dashboard/projects/${project.id}/videos/new`} size="sm">
            <PlusCircle className="size-4" aria-hidden="true" />
            Nouvelle vidéo
          </GxButton>
        }
      />

      <GxTabs
        defaultValue="videos"
        tabs={[
          { value: 'videos', label: 'Vidéos', count: videos.length },
          { value: 'fichiers', label: 'Vos fichiers', count: assets.length },
          { value: 'reglages', label: 'Réglages' },
        ]}
        panels={{
          videos: (
            <div className="mt-6">
              {videos.length === 0 ? (
                <div className="plate p-8 text-center">
                  <p className="text-sm leading-relaxed text-paper-3">
                    Aucune vidéo dans ce projet. Partez d’un sujet : le storyboard reprendra
                    le style défini dans les réglages.
                  </p>
                  <GxButton
                    href={`/dashboard/projects/${project.id}/videos/new`}
                    className="mt-5"
                  >
                    Créer la première vidéo
                  </GxButton>
                </div>
              ) : (
                <ul className="grid gap-3">
                  {videos.map((video) => (
                    <li key={video.id}>
                      <Link
                        href={`/dashboard/videos/${video.id}`}
                        className="group plate relative flex min-h-11 flex-wrap items-center justify-between gap-3 overflow-hidden p-4 transition-[border-color,transform] duration-(--t-fast) hover:-translate-y-0.5 hover:border-line-hi"
                      >
                        <span
                          aria-hidden="true"
                          className="mire absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 transition-transform duration-(--t-fast) group-hover:scale-y-100"
                        />
                        <span className="min-w-0 truncate font-display text-sm font-bold">
                          {video.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="t-data text-xs text-paper-3">
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
            <div className="plate mt-6 p-6">
              <h2 className="font-display text-lg font-bold tracking-tight">Vos fichiers</h2>
              <p className="mt-1 text-sm text-paper-3">
                Les fichiers déposés ici remplacent la génération sur les scènes où vous les
                choisissez. Vous ne payez que ce qui reste à créer.
              </p>
              <div className="mt-5">
                <AssetUploader projectId={project.id} assets={assets} />
              </div>
            </div>
          ),
          reglages: (
            <div className="mt-6 space-y-4">
              <div className="plate p-6">
                <h2 className="font-display text-lg font-bold tracking-tight">Configuration</h2>
                <p className="mt-1 text-sm text-paper-3">
                  Le style et la voix que chaque nouvelle vidéo reprendra.
                </p>
                <div className="mt-5">
                  <EditProjectForm project={project} />
                </div>
              </div>

              <section className="rounded-lg border border-rouge/40 bg-rouge/5 p-6">
                <h2 className="font-display text-lg font-bold tracking-tight text-danger">
                  Supprimer le projet
                </h2>
                <p className="mt-2 text-sm text-paper-2">
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
    </GxPage>
  );
}
