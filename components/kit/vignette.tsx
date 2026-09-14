'use client';

import * as React from 'react';
import { AlertTriangle, Film, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ETATS_ACTIFS } from '@/components/kit/etat';

/*
 * La vignette d'une vidéo.
 * Rendue : le vrai fichier, qui démarre au survol — on montre le résultat,
 * pas une icône qui le représente.
 * Pas encore rendue : une plaque d'attente neutre qui dit où en est la
 * fabrication. L'attente pulse, elle ne s'habille pas en ambre.
 */
export function Vignette({
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

  if (src) {
    return (
      <div
        className={cn('relative aspect-video w-full overflow-hidden bg-canvas', className)}
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
            className="absolute inset-0 flex items-center justify-center bg-canvas/45"
          >
            <Play className="size-7 fill-ink text-ink" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex aspect-video w-full items-center justify-center overflow-hidden bg-surface-2',
        enCours && 'scan',
        className
      )}
    >
      {echec ? (
        <AlertTriangle className="size-6 text-bad" aria-hidden="true" />
      ) : (
        <Film className={cn('size-6', enCours ? 'pulse-wait text-ink-2' : 'text-ink-3')} aria-hidden="true" />
      )}
    </div>
  );
}
