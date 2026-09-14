'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Badge } from '@/components/kit/badge';
import { Card } from '@/components/kit/card';
import { Page, Breadcrumb, Notice } from '@/components/kit/page';

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
  clips: 'Plans animés',
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
    queued: 'En file',
  };

  const tones = {
    pending: 'neutral',
    running: 'neutral',
    succeeded: 'ok',
    failed: 'bad',
    queued: 'neutral',
  } as const;

  return (
    <Badge
      tone={tones[status]}
      live={status === 'pending' || status === 'running' || status === 'queued'}
    >
      {labels[status]}
    </Badge>
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
      <Page className="max-w-4xl">
        <Breadcrumb parent="Admin" parentHref="/dashboard/admin" courant={`Tâche #${jobId}`} />
        <div className="flex items-center justify-center rounded-card border border-line bg-surface p-12">
          <Loader2 className="pulse-wait size-6 text-ink-3" aria-hidden="true" />
        </div>
      </Page>
    );
  }

  if (error || !data?.job) {
    return (
      <Page className="max-w-4xl">
        <Breadcrumb parent="Admin" parentHref="/dashboard/admin" courant={`Tâche #${jobId}`} />
        <Notice tone="erreur">
          {error instanceof Error ? error.message : 'Tâche introuvable ou erreur API.'}
        </Notice>
      </Page>
    );
  }

  const { job, video } = data;

  return (
    <Page className="max-w-4xl">
      <Breadcrumb parent="Admin" parentHref="/dashboard/admin" courant={`Tâche #${job.id}`} />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="t-h2">
              Tâche #{job.id} · {STEP_LABELS[job.step] || job.step}
            </h1>
            <p className="mt-2 text-sm text-ink-2">
              {video ? (
                <>
                  Vidéo :{' '}
                  <Link
                    href={`/dashboard/videos/${video.id}`}
                    className="font-medium text-ink underline-offset-4 hover:underline"
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
            <dt className="t-label">Étape</dt>
            <dd className="font-semibold text-ink">{STEP_LABELS[job.step] || job.step}</dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="t-label">Tentatives</dt>
            <dd className="t-data font-semibold text-ink">
              {job.attempts.toLocaleString('fr-FR')}
            </dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="t-label">Créé le</dt>
            <dd className="t-data text-sm text-ink">
              {new Date(job.createdAt).toLocaleString('fr-FR')}
            </dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="t-label">Mis à jour le</dt>
            <dd className="t-data text-sm text-ink">
              {new Date(job.updatedAt).toLocaleString('fr-FR')}
            </dd>
          </div>

          {job.externalId ? (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="t-label">ID externe</dt>
              <dd className="t-data text-sm text-ink">{job.externalId}</dd>
            </div>
          ) : null}
        </dl>

        {job.error ? (
          <div className="mt-6 rounded-control border border-bad/40 bg-bad/10 p-4">
            <p className="text-sm font-semibold text-bad">Erreur</p>
            <pre className="t-data mt-2 overflow-x-auto text-xs text-bad">{job.error}</pre>
          </div>
        ) : null}

        {job.payload != null ? (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-ink-2 transition-colors duration-(--t-fast) hover:text-ink">
              Payload (JSON)
            </summary>
            <pre className="t-data mt-3 overflow-x-auto rounded-control border border-line bg-surface-2 p-4 text-xs text-ink-2">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </details>
        ) : null}
      </Card>

      <div className="mt-4">
        <Link
          href="/dashboard/admin"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-2 transition-colors duration-(--t-fast) hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour à la supervision
        </Link>
      </div>
    </Page>
  );
}
