'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { GxCard } from '@/components/gx/gx-card';

/*
 * Preuves vérifiées — pas de faux témoignages (copywriting : honnêteté).
 * Carrousel accessible : précédent/suivant + pause, stop sur focus/hover/
 * reduced-motion, position annoncée, clavier complet, pas de drag requis.
 */
export type Proof = { titre: string; metric: string; detail: string };

export function ProofCarousel({ proofs }: { proofs: Proof[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);

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
      ref={regionRef}
      role="region"
      aria-roledescription="carrousel"
      aria-label="Preuves vérifiées"
      className="mx-auto mt-6 max-w-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div aria-live="polite" className="sr-only">
        Preuve {index + 1} sur {proofs.length} : {proofs[index].titre}
      </div>
      <GxCard className="overflow-hidden px-6 py-10 text-center">
        <span aria-hidden="true" className="mire absolute inset-x-0 top-0 h-[3px]" />
        <p key={index} className="t-data a-rise text-4xl font-bold text-marque sm:text-5xl">
          {proofs[index].metric}
        </p>
        <p className="t-label mt-3 text-paper-2">{proofs[index].titre}</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-paper-3">{proofs[index].detail}</p>
      </GxCard>
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Preuve précédente"
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-ink-2 text-paper-2 transition-colors duration-(--t-fast) hover:border-cyan hover:text-paper"
        >
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
              className={`h-2 cursor-pointer rounded-pill transition-all duration-(--t-fast) ${i === index ? 'w-10 mire' : 'w-2 bg-line-hi hover:bg-paper-3'}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Preuve suivante"
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-ink-2 text-paper-2 transition-colors duration-(--t-fast) hover:border-cyan hover:text-paper"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          aria-pressed={paused}
          aria-label={paused ? 'Reprendre la rotation' : 'Suspendre la rotation'}
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-ink-2 text-paper-2 transition-colors duration-(--t-fast) hover:border-cyan hover:text-paper"
        >
          {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
