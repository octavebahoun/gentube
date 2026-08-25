import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { ProjectError, getProject } from '@/lib/projects';
import { getEntitlements } from '@/lib/billing/entitlements';
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

  // L'essai ne produit qu'en 480p. On n'affiche pas un choix que le serveur
  // refusera : une option grisée sans explication se lit comme un bug.
  const { resolutions, watermark } = await getEntitlements(
    tenantDb(user.tenantId)
  );

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href={`/dashboard/projects/${project.id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        {project.name}
      </Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium">New video</h1>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>What are we making?</CardTitle>
        </CardHeader>
        <CardContent>
          <NewVideoForm
            allowedResolutions={resolutions}
            watermark={watermark}
            projectId={project.id}
            projectPipeline={project.defaultPipeline}
          />
        </CardContent>
      </Card>
    </section>
  );
}
