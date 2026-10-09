import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/*
 * L'en-tête d'écran — le même partout : une étiquette, un titre, une action.
 * Un seul H1 et une seule action primaire par écran, sans exception.
 */
export function Page({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('mx-auto w-full max-w-6xl px-(--gutter) py-6 lg:py-8', className)}>
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  titre,
  intro,
  action,
  className,
}: {
  eyebrow: string;
  titre: string;
  intro?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="t-label">{eyebrow}</p>
          <h1 className="t-h1 mt-2">{titre}</h1>
        </div>
        {action}
      </div>
      {intro && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{intro}</p>}
    </header>
  );
}

/* Un bloc de contenu titré. Sert de section dans les écrans de réglages. */
export function Section({
  titre,
  aide,
  action,
  children,
  className,
}: {
  titre: string;
  aide?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="t-h3 text-ink">{titre}</h2>
          {aide && <p className="mt-1 text-sm text-ink-2">{aide}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* Message de résultat d'action : réussite ou échec, annoncé, jamais muet. */
export function Notice({
  tone,
  children,
}: {
  tone: 'ok' | 'erreur';
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === 'erreur' ? 'alert' : 'status'}
      className={cn(
        'rounded-control border px-3 py-2.5 text-sm',
        tone === 'erreur' ? 'border-bad/40 bg-bad/10 text-bad' : 'border-ok/40 bg-ok/10 text-ok'
      )}
    >
      {children}
    </p>
  );
}

/* Radios natives habillées — le natif reste le natif, on ne le remplace pas. */
export function RadioRow({
  name,
  options,
  defaultValue,
  disabled,
  legend,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  disabled?: boolean;
  legend: string;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border border-line bg-surface px-4 text-sm text-ink-2',
              'transition-colors duration-(--t-fast) hover:border-line-strong',
              'has-checked:border-ink-3 has-checked:bg-surface-2 has-checked:text-ink',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink',
              disabled && 'cursor-not-allowed opacity-45'
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              className="size-4 accent-ink"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* Le fil : d'où l'on vient, où l'on est. Deux niveaux, jamais plus. */
export function Breadcrumb({
  parent,
  parentHref,
  courant,
}: {
  parent: string;
  parentHref: string;
  courant: string;
}) {
  return (
    <nav aria-label="Fil d’Ariane" className="mb-5 flex items-center gap-2 text-sm">
      <Link
        href={parentHref}
        className="inline-flex min-h-11 items-center gap-1.5 text-ink-3 transition-colors duration-(--t-fast) hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M8.5 2.5 4 7l4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="square"
          />
        </svg>
        {parent}
      </Link>
      <span aria-hidden="true" className="text-line-strong">
        /
      </span>
      <span aria-current="page" className="min-w-0 truncate text-ink-2">
        {courant}
      </span>
    </nav>
  );
}
