import { redirect } from 'next/navigation';
import { Page, PageHeader, Notice } from '@/components/kit/page';
import { getUser } from '@/lib/db/queries';
import { JobsClient } from './jobs-client';

export default async function AdminPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  if (user.role !== 'owner' && user.role !== 'admin') {
    return (
      <Page className="max-w-4xl">
        <PageHeader eyebrow="Admin" titre="Supervision" />
        <Notice tone="erreur">
          Cette zone est réservée aux propriétaires et administrateurs. Contactez votre
          responsable d'équipe pour obtenir un accès.
        </Notice>
      </Page>
    );
  }

  return (
    <Page className="max-w-7xl">
      <PageHeader
        eyebrow="Admin"
        titre="Supervision"
        intro="Suivi des tâches de fabrication : storyboard, voix, images, plans animés, montage et publication."
      />
      <JobsClient />
    </Page>
  );
}
