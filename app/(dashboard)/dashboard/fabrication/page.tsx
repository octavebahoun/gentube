import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { tenantDb, eq } from '@/lib/db/tenant-db';
import { shots } from '@/lib/db/schema';
import { listVideos } from '@/lib/videos';
import { FabricationClient } from './client';

export default async function FabricationPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  const tdb = tenantDb(user.tenantId);
  const tenant = await tdb.getTenant();
  const allVideos = await listVideos(tdb);

  const sorted = [...allVideos].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const enriched = await Promise.all(
    sorted.map(async (video) => {
      const shotList = await tdb.findMany(shots, eq(shots.videoId, video.id));
      shotList.sort((a, b) => a.order - b.order);
      return { video, shotList };
    })
  );

  return <FabricationClient initialData={enriched} tenantCredits={tenant?.creditsBalance ?? 0} />;
}
