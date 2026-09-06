'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * GX Tile — une vignette de rush. Au repos c'est une image (rien ne charge),
 * au survol ou au focus la vidéo démarre. C'est le geste central du produit :
 * une image fixe qui se met à bouger.
 * Les fichiers viennent de vraies vidéos rendues par GenTube (public/showcase).
 */
export function GxTile({
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
    v.play().then(() => setPlaying(true)).catch(() => {});
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
        'group/tile relative overflow-hidden rounded-lg border border-line bg-ink-2',
        'transition-[border-color,transform] duration-(--t-base) ease-(--ease-out)',
        'hover:-translate-y-1 hover:border-line-hi focus-within:border-cyan',
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
        {/* La mire ne sort que quand la vignette est active. */}
        <span
          aria-hidden="true"
          className="mire absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 transition-transform duration-(--t-base) ease-(--ease-out) group-hover/tile:scale-x-100 group-focus-within/tile:scale-x-100"
        />
      </div>
      {(legend || timecode) && (
        <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
          {legend && <span className="t-label truncate text-paper-2">{legend}</span>}
          {timecode && <span className="t-data text-[0.6875rem] text-paper-3">{timecode}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/*
 * GX Marquee — le banc défile tout seul et s'arrête dès qu'on le survole ou
 * qu'on tabule dedans. Deux copies de la liste, translation de -50 %.
 */
export function GxMarquee({
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
