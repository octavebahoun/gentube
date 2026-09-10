'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Circle, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { GxBadge, GxEmpty } from '@/components/gx/gx-badge-empty';
import { GxButton } from '@/components/gx/gx-button';

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
  createdAt: string;
  updatedAt: string;
  jobs?: {
    total: number;
    pending: number;
    running: number;
    succeeded: number;
    failed: number;
    queued: number;
  };
};

type JobsResponse = {
  jobs: Job[];
  count: number;
};

type VideosResponse = {
  videos: Video[];
  count: number;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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

const STEP_LABELS: Record<string, string> = {
  storyboard: 'Storyboard',
  voix: 'Voix off',
  images: 'Images',
  clips: 'Clips',
  montage: 'Montage',
  publication: 'Publication',
};

export function JobsClient() {
  const [view, setView] = useState<'videos' | 'jobs'>('videos');
  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('');
  const [stepFilter, setStepFilter] = useState('');

  const jobsParams = new URLSearchParams();
  if (statusFilter) jobsParams.set('status', statusFilter);
  if (stepFilter) jobsParams.set('step', stepFilter);
  jobsParams.set('limit', '50');

  const { data: jobsData, error: jobsError } = useSWR<JobsResponse>(
    view === 'jobs' ? `/api/admin/jobs?${jobsParams.toString()}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const { data: videosData, error: videosError } = useSWR<VideosResponse>(
    view === 'videos' ? '/api/admin/videos?limit=50' : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const loading = view === 'jobs' ? !jobsData && !jobsError : !videosData && !videosError;

  return (
    <div className="flex flex-col gap-6">
      {/* Filters & Tabs */}
      <div className="plate p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setView('videos')}
            className={`inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold transition-colors ${
              view === 'videos'
                ? 'bg-marque/15 text-marque border border-marque/30'
                : 'text-paper-3 hover:text-paper'
            }`}
          >
            Vidéos
          </button>
          <button
            onClick={() => setView('jobs')}
            className={`inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold transition-colors ${
              view === 'jobs'
                ? 'bg-marque/15 text-marque border border-marque/30'
                : 'text-paper-3 hover:text-paper'
            }`}
          >
            Jobs
          </button>

          {view === 'jobs' && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as JobStatus | '')}
                className="min-h-10 rounded-lg border border-line bg-ink px-3 text-sm text-paper transition-colors hover:border-line-hi focus:border-marque focus:outline-none"
              >
                <option value="">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="running">En cours</option>
                <option value="succeeded">Réussi</option>
                <option value="failed">Échoué</option>
                <option value="queued">File</option>
              </select>

              <select
                value={stepFilter}
                onChange={(e) => setStepFilter(e.target.value)}
                className="min-h-10 rounded-lg border border-line bg-ink px-3 text-sm text-paper transition-colors hover:border-line-hi focus:border-marque focus:outline-none"
              >
                <option value="">Toutes les étapes</option>
                <option value="storyboard">Storyboard</option>
                <option value="voix">Voix off</option>
                <option value="images">Images</option>
                <option value="clips">Clips</option>
                <option value="montage">Montage</option>
                <option value="publication">Publication</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="plate flex items-center justify-center p-12">
          <Loader2 className="size-8 animate-spin text-marque" />
        </div>
      )}

      {/* Videos View */}
      {view === 'videos' && videosData && (
        <>
          {videosData.videos.length === 0 ? (
            <div className="plate">
              <GxEmpty
                icon={<Circle />}
                title="Aucune vidéo"
                hint="Les vidéos en fabrication apparaîtront ici."
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {videosData.videos.map((video) => (
                <article key={video.id} className="plate p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold">
                        <Link
                          href={`/dashboard/videos/${video.id}`}
                          className="hover:text-marque transition-colors"
                        >
                          {video.title}
                        </Link>
                      </h3>
                      <p className="t-data mt-1 text-xs text-paper-3">
                        Vidéo #{video.id} · {new Date(video.updatedAt).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <GxBadge tone="neutre" dot={false}>
                      {video.status}
                    </GxBadge>
                  </div>

                  {video.jobs && (
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 md:grid-cols-6">
                      <div className="flex flex-col gap-1">
                        <dt className="text-paper-3">Total</dt>
                        <dd className="t-data font-bold">{video.jobs.total}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt className="text-paper-3">En attente</dt>
                        <dd className="t-data font-bold text-paper-3">{video.jobs.pending}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt className="text-paper-3">En cours</dt>
                        <dd className="t-data font-bold text-cyan">{video.jobs.running}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt className="text-paper-3">Réussis</dt>
                        <dd className="t-data font-bold text-ok">{video.jobs.succeeded}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt className="text-paper-3">Échoués</dt>
                        <dd className="t-data font-bold text-danger">{video.jobs.failed}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt className="text-paper-3">File</dt>
                        <dd className="t-data font-bold text-paper-3">{video.jobs.queued}</dd>
                      </div>
                    </dl>
                  )}
                </article>
              ))}
            </div>
          )}

          <p className="text-center text-sm text-paper-3">{videosData.count} vidéo(s) au total</p>
        </>
      )}

      {/* Jobs View */}
      {view === 'jobs' && jobsData && (
        <>
          {jobsData.jobs.length === 0 ? (
            <div className="plate">
              <GxEmpty
                icon={<Circle />}
                title="Aucun job"
                hint="Les jobs de fabrication apparaîtront ici dès qu'une vidéo sera lancée."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-paper-3">
                    <th className="pb-3 pr-4 font-semibold">ID</th>
                    <th className="pb-3 pr-4 font-semibold">Vidéo</th>
                    <th className="pb-3 pr-4 font-semibold">Étape</th>
                    <th className="pb-3 pr-4 font-semibold">Statut</th>
                    <th className="pb-3 pr-4 font-semibold">Tentatives</th>
                    <th className="pb-3 pr-4 font-semibold">Créé</th>
                    <th className="pb-3 pr-4 font-semibold">Mis à jour</th>
                    <th className="pb-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsData.jobs.map((job) => (
                    <tr key={job.id} className="border-b border-line/50 hover:bg-ink/30">
                      <td className="py-3 pr-4">
                        <code className="text-xs text-paper-3">#{job.id}</code>
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/dashboard/videos/${job.videoId}`}
                          className="text-sm hover:text-marque transition-colors"
                        >
                          Vidéo #{job.videoId}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-sm font-medium">
                          {STEP_LABELS[job.step] || job.step}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-sm text-paper-3">{job.attempts}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-xs text-paper-3">
                          {new Date(job.createdAt).toLocaleString('fr-FR')}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-xs text-paper-3">
                          {new Date(job.updatedAt).toLocaleString('fr-FR')}
                        </span>
                      </td>
                      <td className="py-3">
                        <Link
                          href={`/dashboard/admin/jobs/${job.id}`}
                          className="inline-flex items-center gap-1 text-xs text-marque hover:underline"
                        >
                          Détails
                          <ExternalLink className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-center text-sm text-paper-3">{jobsData.count} job(s) au total</p>
        </>
      )}
    </div>
  );
}
