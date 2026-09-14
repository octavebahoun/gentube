'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * La réglette d'onglets — clavier complet (flèches, Home, End),
 * rôles ARIA, cibles 44px. L'onglet actif est souligné d'un trait clair.
 */
export type Tab = { value: string; label: string; count?: number };

export function Tabs({
  tabs,
  panels,
  defaultValue,
  value,
  onValueChange,
  className,
}: {
  tabs: Tab[];
  panels: Record<string, React.ReactNode>;
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
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
        className="no-bar flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t, i) => {
          const selected = t.value === active;
          return (
            <button
              key={t.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`kit-panel-${t.value}`}
              id={`kit-tab-${t.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(t.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 px-3.5 pb-2.5',
                'text-sm font-semibold whitespace-nowrap transition-colors duration-(--t-fast)',
                'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                selected ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    't-data rounded-full px-1.5 py-0.5 text-[0.6875rem]',
                    selected ? 'bg-surface-2 text-ink' : 'bg-surface-2 text-ink-3'
                  )}
                >
                  {t.count}
                </span>
              )}
              {selected && (
                <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" />
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`kit-panel-${active}`}
        aria-labelledby={`kit-tab-${active}`}
        key={active}
      >
        {panels[active]}
      </div>
    </div>
  );
}

/*
 * La même réglette, en liens serveur : chaque onglet est une URL.
 * Pour les listes filtrables (deep-link, retour arrière, partage).
 */
export function TabLinks({
  tabs,
  active,
  className,
}: {
  tabs: { href: string; label: string; count?: number }[];
  active: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Filtres"
      className={cn('no-bar flex gap-1 overflow-x-auto border-b border-line', className)}
    >
      {tabs.map((t) => {
        const selected = t.href.endsWith(active) || t.label === active;
        return (
          <a
            key={t.href}
            href={t.href}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 px-3.5 pb-2.5',
              'text-sm font-semibold whitespace-nowrap transition-colors duration-(--t-fast)',
              'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
              selected ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  't-data rounded-full px-1.5 py-0.5 text-[0.6875rem]',
                  selected ? 'bg-surface-2 text-ink' : 'bg-surface-2 text-ink-3'
                )}
              >
                {t.count}
              </span>
            )}
            {selected && (
              <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" />
            )}
          </a>
        );
      })}
    </nav>
  );
}
