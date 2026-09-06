import * as React from 'react';
import { GxBadge } from '@/components/gx/gx-badge-empty';

/*
 * Le vocabulaire des états — un seul endroit, en français.
 * L'interface ne montre jamais le mot de la base ('draft', 'rendering') :
 * elle montre ce que la personne comprend.
 */
export const ETAT_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  validated: 'Validée',
  generating: 'En fabrication',
  rendering: 'Au montage',
  rendered: 'Terminée',
  published: 'Publiée',
  failed: 'Échouée',
};

type Tone = 'neutre' | 'jaune' | 'cyan' | 'vert' | 'magenta' | 'rouge' | 'bleu';

export const ETAT_TON: Record<string, Tone> = {
  draft: 'neutre',
  validated: 'bleu',
  generating: 'cyan',
  rendering: 'magenta',
  rendered: 'vert',
  published: 'vert',
  failed: 'rouge',
};

/** Les états où quelque chose tourne : le point clignote. */
export const ETATS_ACTIFS = new Set(['validated', 'generating', 'rendering']);

export function EtatBadge({ status, className }: { status: string; className?: string }) {
  return (
    <GxBadge
      tone={ETAT_TON[status] ?? 'neutre'}
      live={ETATS_ACTIFS.has(status)}
      className={className}
    >
      {ETAT_LABEL[status] ?? status}
    </GxBadge>
  );
}
