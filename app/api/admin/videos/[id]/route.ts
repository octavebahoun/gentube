import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { videos, jobs } from '@/lib/db/schema';

/**
 * GET /api/admin/videos/[id] - Détails d'une vidéo avec tous ses jobs.
 * Auth: owner ou admin seulement.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  if (user.role !== 'owner' && user.role !== 'admin') {
    return Response.json(
      { message: 'Admin or owner role required.' },
      { status: 403 }
    );
  }

  const { id } = await params;
  const videoId = parseInt(id, 10);

  if (isNaN(videoId)) {
    return Response.json({ message: 'Invalid video ID.' }, { status: 400 });
  }

  const tdb = tenantDb(user.tenantId);

  try {
    const video = await tdb.findFirst(videos, eq(videos.id, videoId));

    if (!video) {
      return Response.json({ message: 'Video not found.' }, { status: 404 });
    }

    const videoJobs = await tdb.findMany(jobs, eq(jobs.videoId, videoId));

    const jobsByStep = videoJobs.reduce(
      (acc, job) => {
        if (!acc[job.step]) {
          acc[job.step] = [];
        }
        acc[job.step].push({
          id: job.id,
          externalId: job.externalId,
          status: job.status,
          attempts: job.attempts,
          error: job.error,
          payload: job.payload,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        });
        return acc;
      },
      {} as Record<string, any[]>
    );

    return Response.json(
      {
        video: {
          id: video.id,
          title: video.title,
          status: video.status,
          outputUrl: video.outputUrl,
          quality: video.quality,
          pipelineOverride: video.pipelineOverride,
          createdAt: video.createdAt,
          updatedAt: video.updatedAt,
        },
        jobs: videoJobs.map((job) => ({
          id: job.id,
          step: job.step,
          externalId: job.externalId,
          status: job.status,
          attempts: job.attempts,
          error: job.error,
          payload: job.payload,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
        jobsByStep,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[admin/videos/[id]] error:', error);
    return Response.json(
      { message: 'Failed to fetch video details.' },
      { status: 500 }
    );
  }
}
