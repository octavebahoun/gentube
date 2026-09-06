'use client';

import * as React from 'react';
import { AlertTriangle, Film, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ETATS_ACTIFS } from '@/components/gx/gx-etat';

/*
 * La vignette d'une vidéo.
 * Rendue : le vrai fichier, qui démarre au survol — on montre le résultat,
 * pas une icône qui le représente.
 * Pas encore rendue : une plaque d'attente qui dit où en est la fabrication.
 */
export function GxVignette({
  status,
  src,
  titre,
  className,
}: {
  status: string;
  src?: string | null;
  titre: string;
  className?: string;
}) {
  const video = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const enCours = ETATS_ACTIFS.has(status);
  const echec = status === 'failed';

  const start = () => {
    const v = video.current;
    if (!v || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    v.play().then(() => setPlaying(true)).catch(() => {});
  };
  const stop = () => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setPlaying(false);
  };

  if (src) {
    return (
      <div
        className={cn('relative aspect-video w-full overflow-hidden bg-ink', className)}
        onMouseEnter={start}
        onMouseLeave={stop}
      >
        <video
          ref={video}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={`Aperçu de ${titre}`}
          className="size-full object-cover"
        />
        {!playing && (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-ink/40 transition-opacity duration-(--t-fast)"
          >
            <Play className="size-8 fill-jaune text-marque" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex aspect-video w-full items-center justify-center overflow-hidden bg-ink-3',
        enCours && 'scan',
        className
      )}
    >
      {echec ? (
        <AlertTriangle className="size-7 text-danger" aria-hidden="true" />
      ) : (
        <Film className={cn('size-7', enCours ? 'text-info' : 'text-line-hi')} aria-hidden="true" />
      )}
      {enCours && <span aria-hidden="true" className="mire-live absolute inset-x-0 bottom-0 h-[3px]" />}
    </div>
  );
}
