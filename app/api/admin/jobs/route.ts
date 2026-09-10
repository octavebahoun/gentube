import { NextRequest } from 'next/server';
import { desc, eq, and, inArray } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { jobs } from '@/lib/db/schema';

/**
 * GET /api/admin/jobs - Liste les jobs avec filtres optionnels.
 * Auth: owner ou admin seulement.
 * Query params: videoId, step, status, limit
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
  const videoId = searchParams.get('videoId');
  const step = searchParams.get('step');
  const status = searchParams.get('status');
  const limitStr = searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : 100;

  const tdb = tenantDb(user.tenantId);

  try {
    const conditions = [];
    if (videoId) {
      conditions.push(eq(jobs.videoId, parseInt(videoId, 10)));
    }
    if (step) {
      conditions.push(eq(jobs.step, step));
    }
    if (status && ['pending', 'running', 'succeeded', 'failed', 'queued'].includes(status)) {
      conditions.push(eq(jobs.status, status as any));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const result = await tdb.findMany(jobs, where, {
      orderBy: [desc(jobs.createdAt)],
      limit,
    });

    return Response.json(
      {
        jobs: result.map((job) => ({
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
        })),
        count: result.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[admin/jobs] error:', error);
    return Response.json(
      { message: 'Failed to fetch jobs.' },
      { status: 500 }
    );
  }
}
