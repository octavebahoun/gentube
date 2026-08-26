'use client';

import { frenchCredits, seconds } from './utils';

/**
 * Le bandeau de prix : le seul endroit où l'estimation devient engagement.
 * Pointillés tant que la voix off manque, plein rouge une fois mesuré — la
 * bascule doit se voir, c'est elle qui explique au client pourquoi le prix a
 * bougé.
 */
export function PriceStrip({
  credits,
  durationsMeasured,
  spokenSeconds,
  sceneCount,
  resolution,
}: {
  credits: number;
  durationsMeasured: boolean;
  spokenSeconds: number;
  sceneCount: number;
  resolution: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
      <div className="flex items-center gap-4">
        <p className="text-3xl font-semibold tabular-nums">{frenchCredits(credits)}</p>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
            durationsMeasured
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-dashed border-border text-muted-foreground'
          }`}
        >
          {durationsMeasured ? 'prix ferme' : 'prix estimé'}
        </span>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        {durationsMeasured
          ? 'Mesuré sur la voix off enregistrée — c’est ce montant qui sera débité.'
          : 'Indicatif : lu dans le texte, scène par scène. Enregistrez la voix off pour le verrouiller.'}
      </p>
      <p className="w-full text-xs tabular-nums text-muted-foreground sm:w-auto">
        {seconds(Math.round(spokenSeconds * 10) / 10)} de narration · {sceneCount} scène
        {sceneCount === 1 ? '' : 's'} · {resolution}
      </p>
    </div>
  );
}
