import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Clock, Loader2 } from 'lucide-react';
import { GxPage, GxFil } from '@/components/gx/gx-page';
import { GxBadge } from '@/components/gx/gx-badge-empty';
import { getUser } from '@/lib/db/queries';

type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'queued';

type Job = {
  id: number;
  videoId: number;
  step: string;
  externalId: string | null;
  status: JobStatus;
  attempts: number;
  error: string | null;
  payload: any;
  createdAt: string;
  updatedAt: string;
};

type Video = {
  id: number;
  title: string;
  status: string;
  outputUrl: string | null;
};

type JobDetailResponse = {
  job: Job;
  video: Video | null;
};

const STEP_LABELS: Record<string, string> = {
  storyboard: 'Storyboard',
  voix: 'Voix off',
  images: 'Images',
  clips: 'Clips',
  montage: 'Montage',
  publication: 'Publication',
};

function StatusBadge({ status }: { status: JobStatus }) {
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

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (user.role !== 'owner' && user.role !== 'admin') redirect('/dashboard');

  const { id: jobId } = await params;
  
  let job: Job | null = null;
  let video: Video | null = null;

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/jobs/${jobId}`, {
      cache: 'no-store',
    });

    if (res.ok) {
      const data: JobDetailResponse = await res.json();
      job = data.job;
      video = data.video;
    }
  } catch (error) {
    // Fallback en cas d'erreur réseau
  }

  if (!job) {
    return (
      <GxPage className="max-w-4xl">
        <GxFil parent="Admin" parentHref="/dashboard/admin" courant={`Job #${jobId}`} />
        <div className="plate p-6">
          <p className="text-sm text-danger">Job introuvable ou erreur API.</p>
        </div>
      </GxPage>
    );
  }

  return (
    <GxPage className="max-w-4xl">
      <GxFil parent="Admin" parentHref="/dashboard/admin" courant={`Job #${job.id}`} />

      <div className="plate p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="t-h2">
              Job #{job.id} · {STEP_LABELS[job.step] || job.step}
            </h1>
            <p className="mt-2 text-sm text-paper-3">
              {video ? (
                <>
                  Vidéo :{' '}
                  <Link
                    href={`/dashboard/videos/${video.id}`}
                    className="text-marque hover:underline"
                  >
                    {video.title}
                  </Link>
                </>
              ) : (
                `Vidéo #${job.videoId} (non disponible)`
              )}
            </p>
          </div>
          <StatusBadge status={job.status} />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-paper-3">Étape</dt>
            <dd className="font-semibold">{STEP_LABELS[job.step] || job.step}</dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="text-xs text-paper-3">Tentatives</dt>
            <dd className="font-semibold">{job.attempts}</dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="text-xs text-paper-3">Créé le</dt>
            <dd className="text-sm">{new Date(job.createdAt).toLocaleString('fr-FR')}</dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="text-xs text-paper-3">Mis à jour le</dt>
            <dd className="text-sm">{new Date(job.updatedAt).toLocaleString('fr-FR')}</dd>
          </div>

          {job.externalId && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="text-xs text-paper-3">ID externe</dt>
              <dd className="font-mono text-sm">{job.externalId}</dd>
            </div>
          )}
        </dl>

        {job.error && (
          <div className="mt-6 rounded-lg border border-rouge/40 bg-rouge/10 p-4">
            <p className="text-sm font-semibold text-danger">Erreur</p>
            <pre className="mt-2 overflow-x-auto text-xs text-danger">{job.error}</pre>
          </div>
        )}

        {job.payload && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-paper-3 hover:text-paper">
              Payload (JSON)
            </summary>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-ink p-4 text-xs text-paper-3">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <div className="mt-4">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-2 text-sm text-marque hover:underline"
        >
          <ArrowLeft className="size-4" />
          Retour à la régie
        </Link>
      </div>
    </GxPage>
  );
}
