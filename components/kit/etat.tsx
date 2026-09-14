import { Badge } from '@/components/kit/badge';

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

export const ETAT_TON: Record<string, 'neutral' | 'ok' | 'bad'> = {
  draft: 'neutral',
  validated: 'neutral',
  generating: 'neutral',
  rendering: 'neutral',
  rendered: 'ok',
  published: 'ok',
  failed: 'bad',
};

/** Les états où quelque chose tourne : le point pulse. */
export const ETATS_ACTIFS = new Set(['validated', 'generating', 'rendering']);

export function EtatBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={ETAT_TON[status] ?? 'neutral'} live={ETATS_ACTIFS.has(status)} className={className}>
      {ETAT_LABEL[status] ?? status}
    </Badge>
  );
}
