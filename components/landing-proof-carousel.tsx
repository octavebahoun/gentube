'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Card } from '@/components/kit/card';
import { cn } from '@/lib/utils';

/*
 * Preuves vérifiées — pas de faux témoignages (copywriting : honnêteté).
 * Carrousel accessible : précédent/suivant + pause, stop sur focus/hover/
 * reduced-motion, position annoncée, clavier complet, pas de drag requis.
 */
export type Proof = { titre: string; metric: string; detail: string };

const control =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface text-ink-2 transition-colors duration-(--t-fast) hover:border-line-strong hover:text-ink';

export function ProofCarousel({ proofs }: { proofs: Proof[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i + dir + proofs.length) % proofs.length),
    [proofs.length]
  );

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (paused || reduced || proofs.length < 2) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % proofs.length), 6000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, proofs.length]);

  return (
    <div
      role="region"
      aria-roledescription="carrousel"
      aria-label="Preuves vérifiées"
      className="mx-auto max-w-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div aria-live="polite" className="sr-only">
        Preuve {index + 1} sur {proofs.length} : {proofs[index].titre}
      </div>
      <Card className="px-6 py-9 text-center">
        <p key={index} className="t-data text-3xl font-bold text-ink sm:text-4xl">
          {proofs[index].metric}
        </p>
        <p className="t-label mt-3">{proofs[index].titre}</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-2">
          {proofs[index].detail}
        </p>
      </Card>
      <div className="mt-4 flex items-center justify-center gap-2">
        <button type="button" onClick={() => go(-1)} aria-label="Preuve précédente" className={control}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Choisir une preuve">
          {proofs.map((p, i) => (
            <button
              key={p.titre}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${p.titre} (${i + 1}/${proofs.length})`}
              onClick={() => setIndex(i)}
              className={cn(
                'h-1.5 cursor-pointer rounded-full transition-all duration-(--t-fast)',
                i === index ? 'w-8 bg-ink' : 'w-1.5 bg-line-strong hover:bg-ink-3'
              )}
            />
          ))}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Preuve suivante" className={control}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          aria-pressed={paused}
          aria-label={paused ? 'Reprendre la rotation' : 'Suspendre la rotation'}
          className={control}
        >
          {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
