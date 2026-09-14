'use client';

import { Badge } from '@/components/kit/badge';
import { QUALITY_LABEL } from '@/lib/credits/pricing';
import type { Quality } from '@/lib/db/schema';
import { frenchCredits, seconds } from './utils';

/**
 * Le bandeau de prix : le seul endroit où l'estimation devient engagement.
 * Neutre tant que la voix off manque, vert une fois mesuré — la bascule doit
 * se voir, c'est elle qui explique au client pourquoi le prix a bougé.
 */
export function PriceStrip({
  credits,
  durationsMeasured,
  spokenSeconds,
  sceneCount,
  quality,
}: {
  credits: number;
  durationsMeasured: boolean;
  spokenSeconds: number;
  sceneCount: number;
  quality: Quality;
}) {
  return (
    <div className="rounded-control border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="t-data text-2xl font-bold text-ink">{frenchCredits(credits)}</p>
          <Badge tone={durationsMeasured ? 'ok' : 'neutral'} dot={false}>
            {durationsMeasured ? 'prix ferme' : 'prix estimé'}
          </Badge>
        </div>
        <p className="t-data text-xs text-ink-3">
          {seconds(spokenSeconds)} · {sceneCount} scène
          {sceneCount === 1 ? '' : 's'} · {QUALITY_LABEL[quality]}
        </p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-2">
        {durationsMeasured
          ? 'Mesuré sur la voix off enregistrée — c’est ce montant qui sera débité.'
          : 'Indicatif : lu dans le texte, scène par scène. Enregistrez la voix off pour le verrouiller.'}
      </p>
    </div>
  );
}
