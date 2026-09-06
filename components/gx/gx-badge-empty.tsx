import * as React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutre' | 'jaune' | 'cyan' | 'vert' | 'magenta' | 'rouge' | 'bleu';

const tones: Record<Tone, string> = {
  neutre: 'border-line bg-ink-3 text-paper-2 [--dot:var(--color-paper-3)]',
  jaune: 'border-jaune/40 bg-jaune/10 text-marque [--dot:var(--color-jaune)]',
  cyan: 'border-cyan/40 bg-cyan/10 text-info [--dot:var(--color-cyan)]',
  vert: 'border-vert/40 bg-vert/10 text-ok [--dot:var(--color-vert)]',
  magenta: 'border-magenta/40 bg-magenta/10 text-alerte [--dot:var(--color-magenta)]',
  rouge: 'border-rouge/40 bg-rouge/10 text-danger [--dot:var(--color-rouge)]',
  bleu: 'border-bleu/40 bg-bleu/10 text-lien [--dot:var(--color-bleu)]',
};

/*
 * GX Badge — la pastille d'état. Le point clignote quand ça travaille :
 * c'est le seul badge qui bouge, pour que « en cours » se voie de loin.
 */
export function GxBadge({
  className,
  tone = 'neutre',
  dot = true,
  live = false,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean; live?: boolean }) {
  return (
    <span
      className={cn(
        't-label inline-flex items-center gap-2 rounded-pill border px-2.5 py-1.5',
        tones[tone],
        className
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full bg-(--dot)', live && 'a-live')}
        />
      )}
      {children}
    </span>
  );
}

/* GX Empty — un écran vide est une invitation, pas un mur. */
export function GxEmpty({
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
    <div className={cn('flex flex-col items-center gap-4 px-6 py-16 text-center', className)}>
      <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-lg border border-line bg-ink-2 text-marque [&_svg]:size-7">
        <span aria-hidden="true" className="mire absolute inset-x-0 top-0 h-[3px] opacity-60" />
        {icon}
      </span>
      <p className="t-h3">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-paper-3">{hint}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
