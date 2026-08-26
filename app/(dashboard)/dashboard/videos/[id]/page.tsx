import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { getProject } from '@/lib/projects';
import { VideoError } from '@/lib/videos';
import { getStoryboard } from '@/lib/storyboard';
import { isLlmConfigured } from '@/lib/llm/deepseek';
import { isVoiceConfigured } from '@/lib/voice/elevenlabs';
import { DeleteVideoButton, StoryboardEditor } from './storyboard';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  validated: 'bg-amber-500/15 text-amber-400',
  generating: 'bg-amber-500/15 text-amber-400',
  rendering: 'bg-amber-500/15 text-amber-400',
  rendered: 'bg-green-500/15 text-green-400',
  published: 'bg-green-500/15 text-green-400',
  failed: 'bg-red-500/15 text-red-400',
};

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

  const project = await getProject(tdb, board.video.projectId);
  const pipeline = board.video.pipelineOverride ?? project.defaultPipeline;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href={`/dashboard/projects/${project.id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        {project.name}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-lg lg:text-2xl font-medium">{board.video.title}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
            STATUS_STYLE[board.video.status] ?? 'bg-secondary text-secondary-foreground'
          }`}
        >
          {board.video.status}
        </span>
        <span className="text-sm text-muted-foreground">
          {board.video.resolution} · {pipeline} pipeline
        </span>
      </div>

      {board.video.theme && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Thème</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{board.video.theme}</p>
          </CardContent>
        </Card>
      )}

      {!isLlmConfigured() && board.video.status === 'draft' && (
        <p className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          La clé <code>DEEPSEEK_API_KEY</code> manque sur cette instance : la
          génération est indisponible. Les scènes restent éditables à la main.
        </p>
      )}

      {board.shots.length > 0 &&
        !board.durationsMeasured &&
        board.video.status === 'draft' &&
        !isVoiceConfigured() && (
          <p className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
            La clé <code>ELEVENLABS_API_KEY</code> manque : la voix off ne peut
            pas être enregistrée — et sans elle, le prix reste une estimation
            et la vidéo ne peut pas être validée.
          </p>
        )}

      <StoryboardEditor
        video={board.video}
        shots={board.shots}
        creditsEstimated={board.creditsEstimated}
        balance={board.balance}
        canAfford={board.canAfford}
        durationsMeasured={board.durationsMeasured}
      />

      {board.video.status === 'draft' && (
        <Card className="mt-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Zone dangereuse</CardTitle>
        </CardHeader>
          <CardContent>
            <DeleteVideoButton videoId={board.video.id} projectId={project.id} />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
