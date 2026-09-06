'use client';

import * as React from 'react';

/*
 * Le rail de mire, tout en haut de chaque page.
 *
 * Il ne décore pas : il dit où l'on en est. La mire se remplit à mesure qu'on
 * descend, comme une tête de lecture sur une bande. C'est le seul repère
 * permanent du produit, et il répond à la seule question qu'on se pose en
 * arrivant sur une longue page : « il m'en reste combien ? »
 */
export function MireRail() {
  const [avance, setAvance] = React.useState(0);

  React.useEffect(() => {
    let frame = 0;
    const mesurer = () => {
      frame = 0;
      const h = document.documentElement;
      const parcours = h.scrollHeight - h.clientHeight;
      setAvance(parcours > 40 ? Math.min(1, h.scrollTop / parcours) : 1);
    };
    const surScroll = () => {
      if (!frame) frame = requestAnimationFrame(mesurer);
    };
    mesurer();
    window.addEventListener('scroll', surScroll, { passive: true });
    window.addEventListener('resize', surScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', surScroll);
      window.removeEventListener('resize', surScroll);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] bg-line"
    >
      <span
        className="mire block h-full origin-left"
        style={{ transform: `scaleX(${avance})` }}
      />
    </div>
  );
}
