import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * GX Card — la plaque. Coins au rasoir, un trait, un fond levé.
 * Discipline : la carte ordinaire ne fait rien remarquer. C'est GxPerfCard,
 * coiffée de la mire, qui porte la signature — et uniquement là où quelque
 * chose est en train de se fabriquer.
 */
export function GxCard({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn(
        'plate relative p-6 text-paper',
        'transition-[border-color,background-color,transform] duration-(--t-fast) ease-(--ease-out)',
        'hover:border-line-hi',
        className
      )}
      {...rest}
    >
      {children}
    </article>
  );
}

export function GxPerfCard({
  timecode,
  title,
  live = false,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  timecode: string;
  title: string;
  /** Quand ça travaille, la mire défile au lieu de rester figée. */
  live?: boolean;
}) {
  return (
    <article
      className={cn(
        'plate-hi relative overflow-hidden text-paper',
        'transition-[border-color,transform] duration-(--t-fast) ease-(--ease-out)',
        'hover:border-line-hi',
        className
      )}
      {...rest}
    >
      <div aria-hidden="true" className={cn('h-[3px]', live ? 'mire-live' : 'mire')} />
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="t-label text-marque">{title}</p>
        <p className="t-data text-xs text-paper-3">{timecode}</p>
      </div>
      <div className="p-5">{children}</div>
    </article>
  );
}

export function GxCardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('t-h3', className)} {...rest} />;
}

/*
 * La plaque de chiffre : un nombre en mono, une étiquette, une barre de
 * couleur qui dit de quoi on parle. Sert partout dans le tableau de bord.
 */
export function GxStat({
  label,
  value,
  hint,
  tone = 'jaune',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'jaune' | 'cyan' | 'magenta' | 'vert' | 'bleu';
  className?: string;
}) {
  const bars: Record<string, string> = {
    jaune: 'bg-jaune',
    cyan: 'bg-cyan',
    magenta: 'bg-magenta',
    vert: 'bg-vert',
    bleu: 'bg-bleu',
  };
  return (
    <div className={cn('plate relative overflow-hidden p-5 pl-6', className)}>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', bars[tone])} />
      <p className="t-label text-paper-3">{label}</p>
      <p className="t-data mt-2 text-3xl font-bold text-paper">{value}</p>
      {hint && <p className="mt-1 text-xs text-paper-3">{hint}</p>}
    </div>
  );
}
