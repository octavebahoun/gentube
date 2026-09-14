'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clapperboard,
  FileText,
  Film,
  Image as ImageIcon,
  Mic,
  Upload,
} from 'lucide-react';
import { ButtonLink } from '@/components/kit/button';
import { Badge, Empty } from '@/components/kit/badge';
import { Card } from '@/components/kit/card';
import { Progress, Meter } from '@/components/kit/progress';
import { Page, PageHeader, Section, Notice } from '@/components/kit/page';
import { EtatBadge } from '@/components/kit/etat';
import { QUALITY_LABEL } from '@/lib/credits/pricing';
import type { shots, videos } from '@/lib/db/schema';
import { buildEtapes, type EtapeEtat } from './etapes';

const ICONE_ETAPE: Record<string, React.ComponentType<{ className?: string }>> = {
  storyboard: FileText,
  voix: Mic,
  images: ImageIcon,
  clips: Film,
  montage: Clapperboard,
  publication: Upload,
};

function Pastille({ etat }: { etat: EtapeEtat }) {
  if (etat === 'faite') return <CheckCircle2 className="size-4 text-ok" aria-hidden="true" />;
  if (etat === 'encours') return <Meter label="En cours" />;
  if (etat === 'echec') return <AlertTriangle className="size-4 text-bad" aria-hidden="true" />;
  if (etat === 'indispo') return <Ban className="size-4 text-ink-3" aria-hidden="true" />;
  return <CircleDashed className="size-4 text-ink-3" aria-hidden="true" />;
}

function MentionEtape({ etat }: { etat: EtapeEtat }) {
  if (etat === 'encours') return <Badge tone="neutral" live>En cours</Badge>;
  if (etat === 'echec') return <Badge tone="bad">Échoué</Badge>;
  if (etat === 'indispo') return <Badge tone="neutral" dot={false}>Bientôt</Badge>;
  return null;
}

type EnrichedVideo = {
  video: (typeof videos)['$inferSelect'];
  shotList: (typeof shots)['$inferSelect'][];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function FabricationClient({
  initialData,
  tenantCredits,
}: {
  initialData: EnrichedVideo[];
  tenantCredits: number;
}) {
  const { data: enrichedVideos = initialData } = useSWR<EnrichedVideo[]>(
    '/api/fabrication',
    fetcher,
    {
      fallbackData: initialData,
      refreshInterval: (data) => {
        if (!data) return 0;
        const hasActiveJobs = data.some((item) =>
          ['generating', 'rendering', 'validated'].includes(item.video.status)
        );
        return hasActiveJobs ? 5000 : 0;
      },
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  if (enrichedVideos.length === 0) {
    return (
      <Page>
        <PageHeader
          eyebrow="Fabrication"
          titre="La régie"
          intro="Ce qui avance, ce qui a échoué, ce que vous pouvez relancer. Votre point de passage du matin."
        />
        <Empty
          icon={<Clapperboard aria-hidden="true" />}
          title="Rien en fabrication"
          hint="Cet écran s'anime dès que vous lancez une vidéo. Trois postes sur six fonctionnent aujourd'hui : storyboard, voix off et images."
          action={<ButtonLink href="/dashboard/projects">Créer une vidéo</ButtonLink>}
        />
      </Page>
    );
  }

  const enriched = enrichedVideos.map(({ video, shotList }) => {
    const etapes = buildEtapes(video, shotList);
    const faites = etapes.filter((e) => e.etat === 'faite').length;
    const progression = Math.round((faites / etapes.length) * 100);
    return { video, shotList, etapes, progression };
  });

  const enCours = enriched.filter((e) =>
    ['generating', 'rendering', 'validated'].includes(e.video.status)
  );
  const fileAttente = enriched
    .filter((e) => e.video.status === 'validated' || e.video.status === 'draft')
    .slice(0, 6);
  const enEchec = enriched.filter((e) => e.etapes.some((s) => s.etat === 'echec')).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Fabrication"
        titre="La régie"
        intro={
          enCours.length > 0
            ? `${enCours.length} vidéo${enCours.length > 1 ? 's' : ''} en fabrication en ce moment.`
            : 'Aucune vidéo en fabrication en ce moment.'
        }
        action={
          <ButtonLink href="/dashboard/projects" size="sm">
            Nouvelle vidéo
          </ButtonLink>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          {enriched.slice(0, 6).map(({ video, shotList, etapes, progression }) => {
            const aEchoue = etapes.some((e) => e.etat === 'echec');
            return (
              <Card key={video.id} className={aEchoue ? 'border-bad/40' : undefined}>
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-ink">
                        <Link
                          href={`/dashboard/videos/${video.id}`}
                          className="underline-offset-2 transition-colors duration-(--t-fast) hover:underline"
                        >
                          {video.title}
                        </Link>
                      </h2>
                      <p className="t-data mt-1 text-xs text-ink-3">
                        {QUALITY_LABEL[video.quality]} · {video.ratio} · {shotList.length} scène
                        {shotList.length !== 1 ? 's' : ''}
                        {video.creditsConsumed > 0 && ` · ${video.creditsConsumed} crédits débités`}
                      </p>
                    </div>
                    <EtatBadge status={video.status} />
                  </div>

                  <Progress
                    value={progression}
                    label={`Avancement de ${video.title}`}
                    className="mt-4"
                  />
                  <div className="t-data mt-2 flex justify-between text-xs text-ink-3">
                    <span>{progression}% · 3 postes sur 6 actifs</span>
                    <span>{new Date(video.updatedAt).toLocaleDateString('fr-FR')}</span>
                  </div>

                  <ol className="mt-5 flex flex-col gap-3.5">
                    {etapes.map((etape) => {
                      const Icon = ICONE_ETAPE[etape.cle] ?? FileText;
                      const eteint = etape.etat === 'attente' || etape.etat === 'indispo';
                      return (
                        <li key={etape.cle} className="flex gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                            <Pastille etat={etape.etat} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Icon className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                              <span
                                className={`text-sm font-semibold ${eteint ? 'text-ink-3' : 'text-ink'}`}
                              >
                                {etape.titre}
                              </span>
                              <MentionEtape etat={etape.etat} />
                            </div>
                            <p className="mt-1 text-xs text-ink-3">{etape.detail}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  {aEchoue && (
                    <div className="mt-5 space-y-3">
                      <Notice tone="erreur">
                        Une étape a échoué. Ouvrez la vidéo pour lire l'erreur exacte et relancer.
                      </Notice>
                      <ButtonLink
                        href={`/dashboard/videos/${video.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        Voir la vidéo
                      </ButtonLink>
                    </div>
                  )}

                  {video.status === 'draft' &&
                    etapes.every((e) => e.etat === 'indispo' || e.etat === 'attente') && (
                      <p className="mt-5 border-t border-line pt-4 text-xs text-ink-3">
                        Brouillon. Éditez le storyboard puis validez-le pour lancer la fabrication.
                      </p>
                    )}
                </div>
              </Card>
            );
          })}

          {enriched.length > 6 && (
            <p className="text-center text-sm text-ink-3">
              + {enriched.length - 6} vidéo{enriched.length - 6 > 1 ? 's' : ''} plus ancienne
              {enriched.length - 6 > 1 ? 's' : ''} —{' '}
              <Link
                href="/dashboard/videos?etat=all"
                className="text-ink underline underline-offset-2 transition-colors duration-(--t-fast) hover:text-ink-2"
              >
                voir la bibliothèque
              </Link>
              .
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Section titre="File d'attente">
            {fileAttente.length > 0 ? (
              <ul className="divide-y divide-line">
                {fileAttente.map(({ video }) => (
                  <li key={video.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/dashboard/videos/${video.id}`}
                      className="block truncate text-sm font-semibold text-ink underline-offset-2 transition-colors duration-(--t-fast) hover:underline"
                    >
                      {video.title}
                    </Link>
                    <p className="t-data mt-1 text-xs text-ink-3">
                      {QUALITY_LABEL[video.quality]}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">File vide.</p>
            )}
          </Section>

          <Section titre="Cette fabrication">
            <dl className="flex flex-col gap-3 text-sm">
              {[
                ['Vidéos suivies', enriched.length],
                ['En échec', enEchec],
                ['Crédits restants', tenantCredits],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between gap-4">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="t-data font-bold text-ink">
                    {Number(v).toLocaleString('fr-FR')}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Card className="p-5">
            <p className="t-label">3 postes sur 6</p>
            <p className="mt-3 text-xs leading-relaxed text-ink-2">
              Storyboard, voix off et images fonctionnent aujourd'hui. Plans animés, montage et
              publication YouTube arrivent — les cartes le disent plutôt que de le cacher.
            </p>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
