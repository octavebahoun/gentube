import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Film, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { listProjects } from '@/lib/projects';

const PIPELINE_LABEL: Record<string, string> = {
  image: 'Images',
  video: 'Video',
  mixed: 'Mixed',
};

function day(date: Date) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function ProjectsPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const projects = await listProjects(tenantDb(user.tenantId));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-lg lg:text-2xl font-medium">Projects</h1>
        <Link href="/dashboard/projects/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            New project
          </Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Film className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No project yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              A project holds a style, a voice, a YouTube channel and a default
              pipeline. Every video you generate starts from one.
            </p>
            <Link href="/dashboard/projects/new">
              <Button className="mt-2">
                Create the first one
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={`/dashboard/projects/${project.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{project.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {project.stylePrompt ?? 'No style prompt yet.'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-6 text-sm">
                      <div className="text-right">
                        <p className="font-medium">
                          {PIPELINE_LABEL[project.defaultPipeline]}
                        </p>
                        <p className="text-muted-foreground">pipeline</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium tabular-nums">
                          {project.videoCount}
                        </p>
                        <p className="text-muted-foreground">
                          {project.videoCount === 1 ? 'video' : 'videos'}
                        </p>
                      </div>
                      <div className="hidden text-right text-muted-foreground sm:block">
                        <p>{day(project.updatedAt)}</p>
                        <p>updated</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
