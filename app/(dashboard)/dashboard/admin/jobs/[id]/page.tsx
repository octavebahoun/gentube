import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { JobDetailClient } from './job-detail-client';

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role !== 'owner' && user.role !== 'admin') redirect('/dashboard');

  const { id: jobId } = await params;
  return <JobDetailClient jobId={jobId} />;
}
