'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * GX Reveal — le contenu monte quand il entre dans le cadre, une fois.
 * Pas de librairie : un IntersectionObserver et deux classes CSS.
 * Si le visiteur a demandé moins de mouvement, tout est visible d'emblée
 * (la règle est dans globals.css, pas ici — un seul endroit à vérifier).
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = React.useRef<HTMLElement>(null);
  const [seen, setSeen] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return (
    <Tag
      // @ts-expect-error — ref polymorphe, l'élément reste un HTMLElement
      ref={ref}
      className={cn('reveal', seen && 'seen', className)}
      style={{ transitionDelay: seen ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
}
