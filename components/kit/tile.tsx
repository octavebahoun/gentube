'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * La tuile de rush — le geste central du produit : une image fixe
 * qui se met à bouger. Au repos c'est une image (rien ne charge),
 * au survol ou au focus la vidéo démarre.
 */
export function Tile({
  poster,
  src,
  legend,
  timecode,
  className,
}: {
  poster: string;
  src?: string;
  legend?: string;
  timecode?: string;
  className?: string;
}) {
  const video = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(false);

  const start = () => {
    const v = video.current;
    if (!v) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    v.play()
      .then(() => setPlaying(true))
      .catch(() => {});
  };
  const stop = () => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setPlaying(false);
  };

  return (
    <figure
      className={cn(
        'group/tile relative overflow-hidden rounded-card border border-line bg-surface-2',
        'transition-colors duration-(--t-fast) ease-(--ease-out)',
        'hover:border-line-strong focus-within:border-line-strong',
        className
      )}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      tabIndex={src ? 0 : -1}
    >
      <div className="relative aspect-video w-full">
        <img
          src={poster}
          alt={legend ?? ''}
          loading="lazy"
          decoding="async"
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-(--t-base)',
            playing ? 'opacity-0' : 'opacity-100'
          )}
        />
        {src && (
          <video
            ref={video}
            src={src}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            className={cn(
              'absolute inset-0 size-full object-cover transition-opacity duration-(--t-base)',
              playing ? 'opacity-100' : 'opacity-0'
            )}
          />
        )}
      </div>
      {(legend || timecode) && (
        <figcaption className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
          {legend && <span className="truncate text-xs font-medium text-ink-2">{legend}</span>}
          {timecode && <span className="t-data text-[0.6875rem] text-ink-3">{timecode}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/*
 * Le banc qui défile et s'arrête dès qu'on le survole ou qu'on tabule dedans.
 * Deux copies de la liste, translation de -50 %.
 */
export function Marquee({
  children,
  duration = 42,
  reverse = false,
  className,
}: {
  children: React.ReactNode;
  duration?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('marquee-hold relative overflow-hidden', className)} aria-hidden="true">
      <div
        className="marquee gap-3"
        style={{
          ['--marquee-dur' as string]: `${duration}s`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        <div className="flex shrink-0 gap-3 pr-3">{children}</div>
        <div className="flex shrink-0 gap-3 pr-3">{children}</div>
      </div>
    </div>
  );
}
