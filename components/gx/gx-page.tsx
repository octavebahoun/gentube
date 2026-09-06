import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * L'en-tête d'écran — le même partout : une étiquette, un titre, une action.
 * Un seul H1 et une seule action primaire par écran, sans exception.
 */
export function GxPage({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('gutter mx-auto w-full max-w-5xl py-8 lg:py-10', className)}>
      {children}
    </section>
  );
}

export function GxPageHeader({
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
    <header className={cn('mb-8', className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="t-label text-marque">{eyebrow}</p>
          <h1 className="t-h2 mt-3">{titre}</h1>
        </div>
        {action}
      </div>
      {intro && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-paper-3">{intro}</p>}
      <div aria-hidden="true" className="mire mt-6 h-[3px] w-24" />
    </header>
  );
}

/* Un bloc de contenu titré. Sert de section dans les écrans de réglages. */
export function GxSection({
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
    <section className={cn('plate p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight">{titre}</h2>
          {aide && <p className="mt-1 text-sm text-paper-3">{aide}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/* Message de résultat d'action : réussite ou échec, annoncé, jamais muet. */
export function GxNotice({
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
        'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm',
        tone === 'erreur'
          ? 'border-rouge/40 bg-rouge/10 text-danger'
          : 'border-vert/40 bg-vert/10 text-ok'
      )}
    >
      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </p>
  );
}

/* Radios natives habillées — le natif reste le natif, on ne le remplace pas. */
export function GxRadio({
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
      <legend className="t-label mb-3 text-paper-2">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-pill border border-line bg-ink px-4 text-sm',
              'transition-colors duration-(--t-fast) hover:border-line-hi',
              'has-checked:border-jaune has-checked:bg-jaune/10 has-checked:text-marque',
              'has-focus-visible:outline-2 has-focus-visible:outline-cyan has-focus-visible:outline-offset-2',
              disabled && 'cursor-not-allowed opacity-45'
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              className="size-4 accent-jaune"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* Le fil : d'où l'on vient, où l'on est. Deux niveaux, jamais plus. */
export function GxFil({
  parent,
  parentHref,
  courant,
}: {
  parent: string;
  parentHref: string;
  courant: string;
}) {
  return (
    <nav aria-label="Fil d’Ariane" className="mb-6 flex items-center gap-2 text-sm">
      <a
        href={parentHref}
        className="inline-flex min-h-11 items-center gap-1.5 text-paper-3 transition-colors duration-(--t-fast) hover:text-marque"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M8.5 2.5 4 7l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
        </svg>
        {parent}
      </a>
      <span aria-hidden="true" className="text-line-hi">/</span>
      <span aria-current="page" className="min-w-0 truncate text-paper-2">
        {courant}
      </span>
    </nav>
  );
}
