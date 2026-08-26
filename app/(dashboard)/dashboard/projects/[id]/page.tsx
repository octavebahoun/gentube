import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { ProjectError, getProject } from '@/lib/projects';
import { listVideos } from '@/lib/videos';
import { DeleteProjectButton, EditProjectForm } from '../project-form';

const VIDEO_STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  validated: 'bg-amber-100 text-amber-800',
  generating: 'bg-amber-100 text-amber-800',
  rendering: 'bg-amber-100 text-amber-800',
  rendered: 'bg-green-100 text-green-800',
  published: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

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

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/dashboard/projects"
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Projects
      </Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium">{project.name}</h1>

      <Card className="mb-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <EditProjectForm project={project} />
        </CardContent>
      </Card>

      <Card className="mb-8 max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Videos</CardTitle>
          <Link href={`/dashboard/projects/${project.id}/videos/new`}>
            <Button size="sm">
              <PlusCircle className="mr-2 h-4 w-4" />
              New video
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No video yet. A video starts from a theme, and its storyboard is
              generated from this project's style.
            </p>
          ) : (
            <ul className="space-y-3">
              {videos.map((video) => (
                <li key={video.id}>
                  <Link
                    href={`/dashboard/videos/${video.id}`}
                    className="flex items-center justify-between gap-4 rounded-md border border-transparent px-1 py-1 text-sm hover:border-primary/40"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {video.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-muted-foreground tabular-nums">
                        {video.creditsConsumed > 0
                          ? `${video.creditsConsumed} credits charged`
                          : `${video.creditsEstimated} credits est.`}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          VIDEO_STATUS_STYLE[video.status] ??
                          'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {video.status}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A project holding videos cannot be deleted: those videos carry
            consumed credits and published ids. Empty it first.
          </p>
          <DeleteProjectButton projectId={project.id} canDelete={canDelete} />
        </CardContent>
      </Card>
    </section>
  );
}
