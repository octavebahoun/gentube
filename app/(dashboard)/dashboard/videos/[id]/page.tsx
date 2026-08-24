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
  draft: 'bg-gray-100 text-gray-700',
  validated: 'bg-amber-100 text-amber-800',
  generating: 'bg-amber-100 text-amber-800',
  rendering: 'bg-amber-100 text-amber-800',
  rendered: 'bg-green-100 text-green-800',
  published: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
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
            STATUS_STYLE[board.video.status] ?? 'bg-gray-100 text-gray-700'
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
            <CardTitle>Theme</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{board.video.theme}</p>
          </CardContent>
        </Card>
      )}

      {!isLlmConfigured() && board.video.status === 'draft' && (
        <p className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
          <code>DEEPSEEK_API_KEY</code> is missing on this instance, so
          generation is unavailable. Shots can still be written by hand.
        </p>
      )}

      {board.shots.length > 0 &&
        !board.durationsMeasured &&
        board.video.status === 'draft' &&
        !isVoiceConfigured() && (
          <p className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
            <code>ELEVENLABS_API_KEY</code> is missing, so the voice-over cannot
            be recorded — and without it the price stays an estimate and the
            video cannot be validated.
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
            <CardTitle>Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <DeleteVideoButton videoId={board.video.id} projectId={project.id} />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
