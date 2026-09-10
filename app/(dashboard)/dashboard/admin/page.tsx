import { redirect } from 'next/navigation';
import { GxPage, GxPageHeader, GxNotice } from '@/components/gx/gx-page';
import { getUser } from '@/lib/db/queries';
import { JobsClient } from './jobs-client';

export default async function AdminPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  if (user.role !== 'owner' && user.role !== 'admin') {
    return (
      <GxPage className="max-w-4xl">
        <GxPageHeader eyebrow="Admin" titre="Régie opérationnelle" />
        <div className="plate p-6">
          <GxNotice tone="erreur">
            Cette zone est réservée aux propriétaires et administrateurs. Contactez votre
            responsable d'équipe pour obtenir un accès.
          </GxNotice>
        </div>
      </GxPage>
    );
  }

  return (
    <GxPage className="max-w-7xl">
      <GxPageHeader
        eyebrow="Admin"
        titre="Régie opérationnelle"
        intro="Supervision des jobs de fabrication : storyboard, voix, images, clips, montage et publication."
      />
      <JobsClient />
    </GxPage>
  );
}
