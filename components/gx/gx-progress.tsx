import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * GX Progress — la tête de lecture. La barre remplie est la mire elle-même :
 * l'avancement et l'identité sont le même objet.
 * Anime `transform` uniquement, jamais `width`.
 */
export function GxProgress({
  value,
  max = 100,
  label,
  className,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-pill bg-ink-3', className)}
    >
      <span
        aria-hidden="true"
        className="mire absolute inset-0 origin-left transition-transform duration-(--t-slow) ease-(--ease-out)"
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}

/*
 * Le compteur de niveau : six barres qui montent, façon vumètre. Sert à dire
 * « ça travaille » sans afficher un pourcentage qu'on ne connaît pas.
 */
export function GxMeter({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex items-end gap-0.5', className)}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="w-1 origin-bottom rounded-[1px] bg-cyan"
          style={{
            height: `${8 + i * 3}px`,
            animation: `gt-bar ${520 + i * 130}ms ease-in-out ${i * 90}ms infinite alternate`,
          }}
        />
      ))}
    </span>
  );
}
