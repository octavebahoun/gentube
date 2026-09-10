'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { GxPage, GxFil } from '@/components/gx/gx-page';
import { GxBadge } from '@/components/gx/gx-badge-empty';

type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'queued';

type Job = {
  id: number;
  videoId: number;
  step: string;
  externalId: string | null;
  status: JobStatus;
  attempts: number;
  error: string | null;
  payload: unknown;
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
  message?: string;
};

const STEP_LABELS: Record<string, string> = {
  storyboard: 'Storyboard',
  voix: 'Voix off',
  images: 'Images',
  clips: 'Clips',
  montage: 'Montage',
  publication: 'Publication',
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || 'Erreur API');
  }
  return data as JobDetailResponse;
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

export function JobDetailClient({ jobId }: { jobId: string }) {
  const { data, error, isLoading } = useSWR<JobDetailResponse>(
    `/api/admin/jobs/${jobId}`,
    fetcher,
    {
      refreshInterval: (latest) => {
        const status = latest?.job?.status;
        return status === 'running' || status === 'pending' || status === 'queued'
          ? 5000
          : 0;
      },
      revalidateOnFocus: true,
    }
  );

  if (isLoading) {
    return (
      <GxPage className="max-w-4xl">
        <GxFil parent="Admin" parentHref="/dashboard/admin" courant={`Job #${jobId}`} />
        <div className="plate flex items-center justify-center p-12">
          <Loader2 className="size-8 animate-spin text-marque" />
        </div>
      </GxPage>
    );
  }

  if (error || !data?.job) {
    return (
      <GxPage className="max-w-4xl">
        <GxFil parent="Admin" parentHref="/dashboard/admin" courant={`Job #${jobId}`} />
        <div className="plate p-6">
          <p className="text-sm text-danger">
            {error instanceof Error ? error.message : 'Job introuvable ou erreur API.'}
          </p>
        </div>
      </GxPage>
    );
  }

  const { job, video } = data;

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

          {job.externalId ? (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="text-xs text-paper-3">ID externe</dt>
              <dd className="font-mono text-sm">{job.externalId}</dd>
            </div>
          ) : null}
        </dl>

        {job.error ? (
          <div className="mt-6 rounded-lg border border-rouge/40 bg-rouge/10 p-4">
            <p className="text-sm font-semibold text-danger">Erreur</p>
            <pre className="mt-2 overflow-x-auto text-xs text-danger">{job.error}</pre>
          </div>
        ) : null}

        {job.payload != null ? (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-paper-3 hover:text-paper">
              Payload (JSON)
            </summary>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-ink p-4 text-xs text-paper-3">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </details>
        ) : null}
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
