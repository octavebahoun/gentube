import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';
import { shots } from '@/lib/db/schema';
import { listVideos } from '@/lib/videos';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const tdb = tenantDb(user.tenantId);
  const allVideos = await listVideos(tdb);

  const sorted = [...allVideos].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const enriched = await Promise.all(
    sorted.map(async (video) => {
      const shotList = await tdb.findMany(shots, eq(shots.videoId, video.id));
      shotList.sort((a, b) => a.order - b.order);
      return { video, shotList };
    })
  );

  return Response.json(enriched);
}
