'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * GX Tabs — la réglette. Pas de pilule creuse : l'onglet actif est souligné
 * par la mire, comme une piste sélectionnée sur un banc de montage.
 * Clavier complet (flèches, Home, End), rôles ARIA, cibles 44px.
 */
export type GxTab = { value: string; label: string; count?: number };

/*
 * `panels` est un objet de nœuds, pas une fonction : un composant serveur doit
 * pouvoir décrire ses onglets sans franchir la frontière RSC avec un callback.
 */
export function GxTabs({
  tabs,
  panels,
  defaultValue,
  value,
  onValueChange,
  align = 'start',
  className,
}: {
  tabs: GxTab[];
  panels: Record<string, React.ReactNode>;
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  align?: 'start' | 'center';
  className?: string;
}) {
  const [inner, setInner] = React.useState(defaultValue ?? tabs[0]?.value);
  const active = value ?? inner;
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const select = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next !== null) {
      e.preventDefault();
      select(tabs[next].value);
      refs.current[next]?.focus();
    }
  };

  return (
    <div className={cn(className)}>
      <div
        role="tablist"
        aria-label="Onglets"
        className={cn(
          'no-bar flex gap-1 overflow-x-auto border-b border-line',
          align === 'center' && 'justify-start sm:justify-center'
        )}
      >
        {tabs.map((t, i) => {
          const selected = t.value === active;
          return (
            <button
              key={t.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              aria-selected={selected}
              aria-controls={`gx-panel-${t.value}`}
              id={`gx-tab-${t.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(t.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 px-4 pb-3',
                'font-display text-sm font-semibold whitespace-nowrap',
                'transition-colors duration-(--t-fast)',
                'outline-none focus-visible:outline-2 focus-visible:outline-cyan focus-visible:outline-offset-2',
                selected ? 'text-paper' : 'text-paper-3 hover:text-paper-2'
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    't-data rounded-pill px-2 py-0.5 text-[0.6875rem]',
                    selected ? 'bg-jaune text-ink' : 'bg-ink-3 text-paper-3'
                  )}
                >
                  {t.count}
                </span>
              )}
              {selected && (
                <span
                  aria-hidden="true"
                  className="mire absolute inset-x-0 -bottom-px h-[3px] a-wipe"
                />
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`gx-panel-${active}`}
        aria-labelledby={`gx-tab-${active}`}
        className="a-fade"
        key={active}
      >
        {panels[active]}
      </div>
    </div>
  );
}

/*
 * La même réglette, mais en liens serveur : chaque onglet est une URL.
 * Sert aux listes filtrables (deep-link, retour arrière, partage).
 */
export function GxTabLinks({
  tabs,
  active,
  className,
}: {
  tabs: { href: string; label: string; count?: number }[];
  active: string;
  className?: string;
}) {
  return (
    <nav aria-label="Filtres" className={cn('no-bar flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => {
        const selected = t.href.endsWith(active) || t.label === active;
        return (
          <a
            key={t.href}
            href={t.href}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 px-4 pb-3',
              'font-display text-sm font-semibold whitespace-nowrap transition-colors duration-(--t-fast)',
              selected ? 'text-paper' : 'text-paper-3 hover:text-paper-2'
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  't-data rounded-pill px-2 py-0.5 text-[0.6875rem]',
                  selected ? 'bg-jaune text-ink' : 'bg-ink-3 text-paper-3'
                )}
              >
                {t.count}
              </span>
            )}
            {selected && <span aria-hidden="true" className="mire absolute inset-x-0 -bottom-px h-[3px]" />}
          </a>
        );
      })}
    </nav>
  );
}
