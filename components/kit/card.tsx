import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Les surfaces du kit : plates, bordées d'un trait, sans ombre ni dégradé.
 * interactive ajoute le seul mouvement autorisé : un changement de bordure.
 */
export function Card({
  className,
  children,
  interactive = false,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { interactive?: boolean }) {
  return (
    <article
      className={cn(
        'relative rounded-card border border-line bg-surface',
        interactive &&
          'transition-colors duration-(--t-fast) ease-(--ease-out) hover:border-line-strong',
        className
      )}
      {...rest}
    >
      {children}
    </article>
  );
}

export function CardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('t-h3 text-ink', className)} {...rest} />;
}

export function CardBody({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 py-4 sm:px-5', className)} {...rest}>
      {children}
    </div>
  );
}

/* Un chiffre, son libellé, rien d'autre. Pas de barre de couleur décorative. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-card border border-line bg-surface px-4 py-3.5', className)}>
      <p className="t-label">{label}</p>
      <p className="t-data mt-1.5 text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
