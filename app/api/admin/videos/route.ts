import { NextRequest } from 'next/server';
import { desc, eq, and, sql } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { videos, jobs } from '@/lib/db/schema';

/**
 * GET /api/admin/videos - Liste les vidéos avec leur statut et résumé des jobs.
 * Auth: owner ou admin seulement.
 * Query params: status, limit
 */
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const limitStr = searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : 50;

  const tdb = tenantDb(user.tenantId);

  try {
    const where = status ? eq(videos.status, status as any) : undefined;
    const videoList = await tdb.findMany(videos, where, {
      orderBy: [desc(videos.createdAt)],
      limit,
    });

    // Pour chaque vidéo, compter les jobs par statut
    const videosWithJobs = await Promise.all(
      videoList.map(async (video) => {
        const videoJobs = await tdb.findMany(jobs, eq(jobs.videoId, video.id));

        const jobsSummary = videoJobs.reduce(
          (acc, job) => {
            acc[job.status] = (acc[job.status] || 0) + 1;
            acc.total += 1;
            return acc;
          },
          {
            total: 0,
            pending: 0,
            running: 0,
            succeeded: 0,
            failed: 0,
            queued: 0,
          } as Record<string, number>
        );

        return {
          id: video.id,
          title: video.title,
          status: video.status,
          outputUrl: video.outputUrl,
          createdAt: video.createdAt,
          updatedAt: video.updatedAt,
          jobs: jobsSummary,
        };
      })
    );

    return Response.json(
      {
        videos: videosWithJobs,
        count: videosWithJobs.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[admin/videos] error:', error);
    return Response.json(
      { message: 'Failed to fetch videos.' },
      { status: 500 }
    );
  }
}
