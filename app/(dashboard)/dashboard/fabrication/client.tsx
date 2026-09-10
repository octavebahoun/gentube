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
import { GxButton } from '@/components/gx/gx-button';
import { GxBadge, GxEmpty } from '@/components/gx/gx-badge-empty';
import { GxProgress, GxMeter } from '@/components/gx/gx-progress';
import { GxPage, GxPageHeader } from '@/components/gx/gx-page';
import { EtatBadge } from '@/components/gx/gx-etat';
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
  if (etat === 'faite') return <CheckCircle2 className="size-5 text-ok" aria-hidden="true" />;
  if (etat === 'encours') return <GxMeter label="En cours" />;
  if (etat === 'echec') return <AlertTriangle className="size-5 text-danger" aria-hidden="true" />;
  if (etat === 'indispo') return <Ban className="size-5 text-line-hi" aria-hidden="true" />;
  return <CircleDashed className="size-5 text-paper-3" aria-hidden="true" />;
}

function MentionEtape({ etat }: { etat: EtapeEtat }) {
  if (etat === 'encours') return <GxBadge tone="cyan" live>En cours</GxBadge>;
  if (etat === 'echec') return <GxBadge tone="rouge">Échoué</GxBadge>;
  if (etat === 'indispo') return <GxBadge tone="neutre" dot={false}>Bientôt</GxBadge>;
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
      <GxPage className="max-w-6xl">
        <GxPageHeader
          eyebrow="Fabrication"
          titre="La régie"
          intro="Ce qui avance, ce qui a échoué, ce que vous pouvez relancer. Votre point de passage du matin."
        />
        <div className="plate">
          <GxEmpty
            icon={<Clapperboard aria-hidden="true" />}
            title="Rien en fabrication"
            hint="Cet écran s'anime dès que vous lancez une vidéo. Trois postes sur six fonctionnent aujourd'hui : storyboard, voix off et images."
            action={<GxButton href="/dashboard/projects">Créer une vidéo</GxButton>}
          />
        </div>
      </GxPage>
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
    <GxPage className="max-w-6xl">
      <GxPageHeader
        eyebrow="Fabrication"
        titre="La régie"
        intro={
          enCours.length > 0
            ? `${enCours.length} vidéo${enCours.length > 1 ? 's' : ''} en fabrication en ce moment.`
            : 'Aucune vidéo en fabrication en ce moment.'
        }
        action={
          <GxButton href="/dashboard/projects" variant="secondary" size="sm">
            Nouvelle vidéo
          </GxButton>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          {enriched.slice(0, 6).map(({ video, shotList, etapes, progression }) => {
            const aEchoue = etapes.some((e) => e.etat === 'echec');
            const travaille = etapes.some((e) => e.etat === 'encours');
            return (
              <article
                key={video.id}
                className={`plate overflow-hidden ${aEchoue ? 'border-rouge/40' : ''}`}
              >
                <div aria-hidden="true" className={travaille ? 'mire-live h-[3px]' : 'h-[3px] bg-line'} />

                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-bold">
                        <Link
                          href={`/dashboard/videos/${video.id}`}
                          className="transition-colors duration-(--t-fast) hover:text-marque"
                        >
                          {video.title}
                        </Link>
                      </h2>
                      <p className="t-data mt-1 text-xs text-paper-3">
                        {QUALITY_LABEL[video.quality]} · {video.ratio} · {shotList.length} scène
                        {shotList.length !== 1 ? 's' : ''}
                        {video.creditsConsumed > 0 && ` · ${video.creditsConsumed} crédits débités`}
                      </p>
                    </div>
                    <EtatBadge status={video.status} />
                  </div>

                  <GxProgress
                    value={progression}
                    label={`Avancement de ${video.title}`}
                    className="mt-4"
                  />
                  <div className="t-data mt-2 flex justify-between text-xs text-paper-3">
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
                              <Icon className="size-3.5 shrink-0 text-paper-3" aria-hidden="true" />
                              <span
                                className={`font-display text-sm font-semibold ${eteint ? 'text-paper-3' : 'text-paper'}`}
                              >
                                {etape.titre}
                              </span>
                              <MentionEtape etat={etape.etat} />
                            </div>
                            <p className="mt-1 text-xs text-paper-3">{etape.detail}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  {aEchoue && (
                    <div className="mt-5 rounded-lg border border-rouge/40 bg-rouge/10 p-4">
                      <p className="text-xs leading-relaxed text-danger">
                        Une étape a échoué. Ouvrez la vidéo pour lire l'erreur exacte et relancer.
                      </p>
                      <GxButton
                        href={`/dashboard/videos/${video.id}`}
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                      >
                        Voir la vidéo
                      </GxButton>
                    </div>
                  )}

                  {video.status === 'draft' &&
                    etapes.every((e) => e.etat === 'indispo' || e.etat === 'attente') && (
                      <p className="mt-5 border-t border-line pt-4 text-xs text-paper-3">
                        Brouillon. Éditez le storyboard puis validez-le pour lancer la fabrication.
                      </p>
                    )}
                </div>
              </article>
            );
          })}

          {enriched.length > 6 && (
            <p className="text-center text-sm text-paper-3">
              + {enriched.length - 6} vidéo{enriched.length - 6 > 1 ? 's' : ''} plus ancienne
              {enriched.length - 6 > 1 ? 's' : ''} —{' '}
              <Link href="/dashboard/videos?etat=all" className="text-marque hover:underline">
                voir la bibliothèque
              </Link>
              .
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <section className="plate p-5">
            <h2 className="t-label text-paper-3">File d'attente</h2>
            {fileAttente.length > 0 ? (
              <ul className="mt-4 divide-y divide-line">
                {fileAttente.map(({ video }) => (
                  <li key={video.id} className="py-3 first:pt-0">
                    <Link
                      href={`/dashboard/videos/${video.id}`}
                      className="block truncate text-sm font-semibold transition-colors duration-(--t-fast) hover:text-marque"
                    >
                      {video.title}
                    </Link>
                    <p className="t-data mt-1 text-xs text-paper-3">
                      {QUALITY_LABEL[video.quality]}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-paper-3">File vide.</p>
            )}
          </section>

          <section className="plate p-5">
            <h2 className="t-label text-paper-3">Cette fabrication</h2>
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              {[
                ['Vidéos suivies', enriched.length],
                ['En échec', enEchec],
                ['Crédits restants', tenantCredits],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between gap-4">
                  <dt className="text-paper-3">{k}</dt>
                  <dd className="t-data font-bold">{Number(v).toLocaleString('fr-FR')}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-lg border border-info/30 bg-info/5 p-5">
            <p className="t-label text-marque">3 postes sur 6</p>
            <p className="mt-3 text-xs leading-relaxed text-paper-2">
              Storyboard, voix off et images fonctionnent aujourd'hui. Plans animés, montage et
              publication YouTube arrivent — les cartes le disent plutôt que de le cacher.
            </p>
          </section>
        </aside>
      </div>
    </GxPage>
  );
}
