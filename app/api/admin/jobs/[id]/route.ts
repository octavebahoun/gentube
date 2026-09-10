import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { jobs, videos } from '@/lib/db/schema';

/**
 * GET /api/admin/jobs/[id] - Détails d'un job spécifique avec sa vidéo.
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
  const jobId = parseInt(id, 10);

  if (isNaN(jobId)) {
    return Response.json({ message: 'Invalid job ID.' }, { status: 400 });
  }

  const tdb = tenantDb(user.tenantId);

  try {
    const job = await tdb.findFirst(jobs, eq(jobs.id, jobId));

    if (!job) {
      return Response.json({ message: 'Job not found.' }, { status: 404 });
    }

    // Charger aussi la vidéo associée pour contexte
    const video = await tdb.findFirst(videos, eq(videos.id, job.videoId));

    return Response.json(
      {
        job: {
          id: job.id,
          videoId: job.videoId,
          step: job.step,
          externalId: job.externalId,
          status: job.status,
          attempts: job.attempts,
          error: job.error,
          payload: job.payload,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        },
        video: video
          ? {
              id: video.id,
              title: video.title,
              status: video.status,
              outputUrl: video.outputUrl,
            }
          : null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[admin/jobs/[id]] error:', error);
    return Response.json(
      { message: 'Failed to fetch job details.' },
      { status: 500 }
    );
  }
}
