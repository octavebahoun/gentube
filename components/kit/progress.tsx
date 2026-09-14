import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * La jauge. Neutre tant que ça travaille, verte quand c'est fini,
 * rouge quand c'est cassé. L'ambre n'y touche pas.
 */
export function Progress({
  value,
  max = 100,
  label,
  tone = 'neutral',
  className,
}: {
  value: number;
  max?: number;
  label: string;
  tone?: 'neutral' | 'ok' | 'bad';
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  const fills = {
    neutral: 'bg-ink-2',
    ok: 'bg-ok',
    bad: 'bg-bad',
  };

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-full origin-left transition-transform duration-300 ease-out',
          fills[tone]
        )}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}

/* Le témoin d'activité : des barres qui montent et descendent, en gris. */
export function Meter({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex items-end gap-0.5', className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="w-1 origin-bottom rounded-full bg-ink-3"
          style={{
            height: `${8 + i * 3}px`,
            animation: `kit-meter ${520 + i * 130}ms ease-in-out ${i * 90}ms infinite alternate`,
          }}
        />
      ))}
    </span>
  );
}
