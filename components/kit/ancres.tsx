'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Les ancres de la page d'accueil, dans la barre unique.
 * Celle qu'on est en train de lire s'allume.
 */
export type Ancre = { id: string; label: string };

export function Ancres({ ancres, className }: { ancres: Ancre[]; className?: string }) {
  const [actif, setActif] = React.useState(ancres[0]?.id ?? '');

  React.useEffect(() => {
    const cibles = ancres
      .map((a) => document.getElementById(a.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (cibles.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActif(visible.target.id);
      },
      { rootMargin: '-20% 0px -68% 0px', threshold: 0 }
    );
    cibles.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ancres]);

  return (
    <nav aria-label="Sections de la page" className={cn('flex items-center', className)}>
      {ancres.map((a) => {
        const courant = actif === a.id;
        return (
          <a
            key={a.id}
            href={`#${a.id}`}
            aria-current={courant ? 'true' : undefined}
            className={cn(
              'relative inline-flex min-h-11 cursor-pointer items-center px-3',
              'text-sm font-medium whitespace-nowrap transition-colors duration-(--t-fast)',
              courant ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
            )}
          >
            {a.label}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-x-3 bottom-1.5 h-px origin-left bg-ink transition-transform duration-(--t-fast) ease-(--ease-out)',
                courant ? 'scale-x-100' : 'scale-x-0'
              )}
            />
          </a>
        );
      })}
    </nav>
  );
}
