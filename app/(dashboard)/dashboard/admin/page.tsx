import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Circle, Clock, Loader2, PlayCircle } from 'lucide-react';
import { GxPage, GxPageHeader, GxNotice } from '@/components/gx/gx-page';
import { GxBadge, GxEmpty } from '@/components/gx/gx-badge-empty';
import { GxButton } from '@/components/gx/gx-button';
import { getUser } from '@/lib/db/queries';
import { JobsClient } from './jobs-client';

type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'queued';

function StatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case 'succeeded':
      return <CheckCircle2 className="size-4 text-ok" />;
    case 'failed':
      return <AlertTriangle className="size-4 text-danger" />;
    case 'running':
      return <Loader2 className="size-4 animate-spin text-cyan" />;
    case 'pending':
      return <Clock className="size-4 text-paper-3" />;
    case 'queued':
      return <Circle className="size-4 text-paper-3" />;
  }
}

export function StatusBadge({ status }: { status: JobStatus }) {
  const labels: Record<JobStatus, string> = {
    pending: 'En attente',
    running: 'En cours',
    succeeded: 'Réussi',
    failed: 'Échoué',
    queued: 'File',
  };

  const tones = {
    pending: 'neutre' as const,
    running: 'cyan' as const,
    succeeded: 'vert' as const,
    failed: 'rouge' as const,
    queued: 'neutre' as const,
  };

  return (
    <GxBadge tone={tones[status]} dot={false}>
      {labels[status]}
    </GxBadge>
  );
}

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
