import { notFound, redirect } from 'next/navigation';
import { ButtonLink } from '@/components/kit/button';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { ProjectError, getProject } from '@/lib/projects';
import { getEntitlements } from '@/lib/billing/entitlements';
import { Page, PageHeader, Breadcrumb } from '@/components/kit/page';
import { NewVideoForm } from './new-video-form';

export default async function NewVideoPage({
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
    if (error instanceof ProjectError) notFound();
    throw error;
  }

  // L'essai et le plan Starter ne produisent qu'en Full HD. On n'affiche pas
  // un choix que le serveur refusera : une option grisée sans explication se
  // lit comme un bug.
  const { qualities, watermark } = await getEntitlements(tenantDb(user.tenantId));

  return (
    <Page className="max-w-3xl">
      <Breadcrumb
        parent={project.name}
        parentHref={`/dashboard/projects/${project.id}`}
        courant="Nouvelle vidéo"
      />
      <PageHeader
        eyebrow="Vidéo"
        titre="Nouvelle vidéo"
        intro="Le storyboard est écrit à partir du sujet. Le style et la voix du projet s’appliquent."
      />
      <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
        <NewVideoForm
          allowedQualities={qualities}
          watermark={watermark}
          projectId={project.id}
          projectPipeline={project.defaultPipeline}
        />
      </div>
    </Page>
  );
}
