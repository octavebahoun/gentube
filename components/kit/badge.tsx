import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Badge d'état.
 * - neutral : rien ne tourne, ou en attente — pulsation si live.
 * - ok : c'est fini, c'est publié, c'est actif.
 * - bad : ça a échoué.
 * Jamais d'ambre ici : l'ambre est une action, pas un état.
 */
type Tone = 'neutral' | 'ok' | 'bad';

const tones: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2 text-ink-2 [--dot:var(--color-ink-3)]',
  ok: 'border-ok/30 bg-ok/10 text-ok [--dot:var(--color-ok)]',
  bad: 'border-bad/30 bg-bad/10 text-bad [--dot:var(--color-bad)]',
};

export function Badge({
  tone = 'neutral',
  dot = true,
  live = false,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean; live?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap uppercase tracking-wide',
        tones[tone],
        className
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full bg-(--dot)', live && 'pulse-wait')}
        />
      )}
      {children}
    </span>
  );
}

/* Un écran vide est une invitation à agir, pas une humeur. */
export function Empty({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center',
        className
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-control border border-line bg-surface-2 text-ink-3 [&_svg]:size-5">
        {icon}
      </span>
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-ink-2">{hint}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
