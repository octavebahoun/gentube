'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Circle, ExternalLink, Loader2 } from 'lucide-react';
import { Badge, Empty } from '@/components/kit/badge';
import { Card } from '@/components/kit/card';
import { EtatBadge } from '@/components/kit/etat';
import { Select } from '@/components/kit/field';
import { Tabs } from '@/components/kit/tabs';

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

const STEP_LABELS: Record<string, string> = {
  storyboard: 'Storyboard',
  voix: 'Voix off',
  images: 'Images',
  clips: 'Plans animés',
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

  const attente = (
    <div className="flex items-center justify-center rounded-card border border-line bg-surface p-12">
      <Loader2 className="pulse-wait size-6 text-ink-3" aria-hidden="true" />
    </div>
  );

  return (
    <Tabs
      value={view}
      onValueChange={(v) => setView(v as 'videos' | 'jobs')}
      tabs={[
        { value: 'videos', label: 'Vidéos' },
        { value: 'jobs', label: 'Tâches' },
      ]}
      panels={{
        videos: (
          <div className="mt-5 space-y-4">
            {loading && attente}

            {videosData &&
              (videosData.videos.length === 0 ? (
                <Empty
                  icon={<Circle aria-hidden="true" />}
                  title="Aucune vidéo"
                  hint="Les vidéos en fabrication apparaîtront ici."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {videosData.videos.map((video) => (
                    <Card key={video.id} className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="t-h3">
                            <Link
                              href={`/dashboard/videos/${video.id}`}
                              className="inline-flex min-h-11 items-center underline-offset-4 transition-colors duration-(--t-fast) hover:underline"
                            >
                              {video.title}
                            </Link>
                          </h3>
                          <p className="t-data mt-1 text-xs text-ink-3">
                            Vidéo #{video.id} · {new Date(video.updatedAt).toLocaleString('fr-FR')}
                          </p>
                        </div>
                        <EtatBadge status={video.status} />
                      </div>

                      {video.jobs && (
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 md:grid-cols-5">
                          <div className="flex flex-col gap-1">
                            <dt className="t-label">Total</dt>
                            <dd className="t-data font-bold text-ink">
                              {video.jobs.total.toLocaleString('fr-FR')}
                            </dd>
                          </div>
                          <div className="flex flex-col gap-1">
                            <dt className="t-label">En file</dt>
                            <dd className="t-data font-bold text-ink-3">
                              {video.jobs.queued.toLocaleString('fr-FR')}
                            </dd>
                          </div>
                          <div className="flex flex-col gap-1">
                            <dt className="t-label">En cours</dt>
                            <dd className="t-data font-bold text-ink-2">
                              {video.jobs.running.toLocaleString('fr-FR')}
                            </dd>
                          </div>
                          <div className="flex flex-col gap-1">
                            <dt className="t-label">Réussis</dt>
                            <dd className="t-data font-bold text-ok">
                              {video.jobs.succeeded.toLocaleString('fr-FR')}
                            </dd>
                          </div>
                          <div className="flex flex-col gap-1">
                            <dt className="t-label">Échoués</dt>
                            <dd className="t-data font-bold text-bad">
                              {video.jobs.failed.toLocaleString('fr-FR')}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </Card>
                  ))}
                </div>
              ))}

            {videosData && (
              <p className="text-center text-sm text-ink-3">
                {videosData.count.toLocaleString('fr-FR')}{' '}
                {videosData.count > 1 ? 'vidéos' : 'vidéo'} au total
              </p>
            )}
          </div>
        ),
        jobs: (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-56">
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as JobStatus | '')}
                  aria-label="Filtrer par statut"
                >
                  <option value="">Tous les statuts</option>
                  <option value="running">En cours</option>
                  <option value="succeeded">Réussi</option>
                  <option value="failed">Échoué</option>
                  <option value="queued">En file</option>
                </Select>
              </div>

              <div className="w-full sm:w-56">
                <Select
                  value={stepFilter}
                  onChange={(e) => setStepFilter(e.target.value)}
                  aria-label="Filtrer par étape"
                >
                  <option value="">Toutes les étapes</option>
                  <option value="storyboard">Storyboard</option>
                  <option value="voix">Voix off</option>
                  <option value="images">Images</option>
                  <option value="clips">Plans animés</option>
                  <option value="montage">Montage</option>
                  <option value="publication">Publication</option>
                </Select>
              </div>
            </div>

            {loading && attente}

            {jobsData &&
              (jobsData.jobs.length === 0 ? (
                <Empty
                  icon={<Circle aria-hidden="true" />}
                  title="Aucune tâche"
                  hint="Les tâches de fabrication apparaîtront ici dès qu'une vidéo sera lancée."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] border-collapse">
                    <thead>
                      <tr className="border-b border-line text-left">
                        <th className="t-label pb-3 pr-4">ID</th>
                        <th className="t-label pb-3 pr-4">Vidéo</th>
                        <th className="t-label pb-3 pr-4">Étape</th>
                        <th className="t-label pb-3 pr-4">Statut</th>
                        <th className="t-label pb-3 pr-4">Tentatives</th>
                        <th className="t-label pb-3 pr-4">Créé</th>
                        <th className="t-label pb-3 pr-4">Mis à jour</th>
                        <th className="t-label pb-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobsData.jobs.map((job) => (
                        <tr
                          key={job.id}
                          className="border-b border-line/50 transition-colors duration-(--t-fast) hover:bg-surface-2"
                        >
                          <td className="py-3 pr-4">
                            <span className="t-data text-xs text-ink-3">#{job.id}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <Link
                              href={`/dashboard/videos/${job.videoId}`}
                              className="inline-flex min-h-11 items-center text-sm text-ink-2 underline-offset-4 transition-colors duration-(--t-fast) hover:text-ink hover:underline"
                            >
                              Vidéo #{job.videoId}
                            </Link>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="text-sm font-medium text-ink">
                              {STEP_LABELS[job.step] || job.step}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge status={job.status} />
                          </td>
                          <td className="py-3 pr-4">
                            <span className="t-data text-sm text-ink-3">
                              {job.attempts.toLocaleString('fr-FR')}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="t-data text-xs text-ink-3">
                              {new Date(job.createdAt).toLocaleString('fr-FR')}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="t-data text-xs text-ink-3">
                              {new Date(job.updatedAt).toLocaleString('fr-FR')}
                            </span>
                          </td>
                          <td className="py-3">
                            <Link
                              href={`/dashboard/admin/jobs/${job.id}`}
                              className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-ink-2 transition-colors duration-(--t-fast) hover:text-ink"
                            >
                              Détails
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {jobsData && (
              <p className="text-center text-sm text-ink-3">
                {jobsData.count.toLocaleString('fr-FR')}{' '}
                {jobsData.count > 1 ? 'tâches' : 'tâche'} au total
              </p>
            )}
          </div>
        ),
      }}
    />
  );
}
