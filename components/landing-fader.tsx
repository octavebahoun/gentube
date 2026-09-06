'use client';

import * as React from 'react';
import {
  CREDIT_FCFA,
  CREDITS_MONTAGE,
  CREDITS_PER_IMAGE,
  imagesAffordable,
  secondsAffordable,
} from '@/lib/credits/pricing';

/*
 * LE FADER — la signature interactive de la page.
 *
 * Un potentiomètre de table de mixage : on pousse le budget, et les trois
 * afficheurs bougent en direct. Ça répond à la seule question que se pose
 * quelqu'un devant une grille en crédits — « ça me fait combien de vidéo ? » —
 * au lieu de la laisser faire la division lui-même.
 * Les chiffres viennent de lib/credits/pricing : rien n'est inventé ici.
 */

const MIN = 120;
const MAX = 3000;

function duree(secondes: number) {
  const min = Math.floor(secondes / 60);
  const rest = Math.round(secondes % 60);
  if (min === 0) return `${rest} s`;
  return rest ? `${min} min ${rest} s` : `${min} min`;
}

export function Fader() {
  const [credits, setCredits] = React.useState(600);

  // Le montage se paie une fois par vidéo : on le retire avant de convertir,
  // sinon on promettrait une durée qu'on ne peut pas livrer.
  const utiles = Math.max(0, credits - CREDITS_MONTAGE);
  const secondes = secondsAffordable(utiles, 'draft');
  const images = imagesAffordable(utiles);
  const fcfa = credits * CREDIT_FCFA;
  const position = (credits - MIN) / (MAX - MIN);

  return (
    <div className="plate overflow-hidden">
      <div aria-hidden="true" className="mire h-[3px]" />

      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        {/* Le potentiomètre */}
        <div>
          <label htmlFor="fader" className="t-label block text-paper-3">
            Votre budget
          </label>

          <p className="t-data mt-4 text-5xl font-bold text-marque">
            {credits.toLocaleString('fr-FR')}
            <span className="ml-2 text-base font-normal text-paper-3">crédits</span>
          </p>
          <p className="t-data mt-1 text-sm text-paper-2">
            {fcfa.toLocaleString('fr-FR')} FCFA
          </p>

          <div className="relative mt-7">
            {/* La piste : sombre à gauche de la tête, mire à droite. */}
            <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-pill bg-ink-3">
              <span
                className="mire block h-full origin-left transition-transform duration-(--t-tap)"
                style={{ transform: `scaleX(${position})` }}
              />
            </div>
            <input
              id="fader"
              type="range"
              min={MIN}
              max={MAX}
              step={20}
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
              aria-valuetext={`${credits} crédits, soit ${fcfa} FCFA`}
              className="relative w-full cursor-pointer appearance-none bg-transparent
                [&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:bg-transparent
                [&::-webkit-slider-thumb]:mt-[0.9rem] [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:rounded-pill
                [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-paper
                [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-pill
                [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-paper
                [&::-moz-range-track]:h-11 [&::-moz-range-track]:bg-transparent"
            />
          </div>

          <div className="t-data mt-1 flex justify-between text-xs text-paper-3">
            <span>{MIN} cr</span>
            <span>{MAX.toLocaleString('fr-FR')} cr</span>
          </div>
        </div>

        {/* Les afficheurs */}
        <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          {[
            ['En Full HD', duree(secondes), 'montage compris'],
            ['En images fixes', images.toLocaleString('fr-FR'), `${CREDITS_PER_IMAGE} crédits l'image`],
            ['Vidéos de 30 s', String(Math.floor(credits / (30 * 2 + CREDITS_MONTAGE))), 'environ'],
          ].map(([k, v, note]) => (
            <div key={k} className="bg-ink-2 p-5">
              <dt className="t-label text-paper-3">{k}</dt>
              <dd className="t-data mt-3 text-2xl font-bold">{v}</dd>
              <p className="mt-1 text-xs text-paper-3">{note}</p>
            </div>
          ))}
        </dl>
      </div>

      <p className="border-t border-line px-6 py-4 text-xs text-paper-3 sm:px-8">
        Calculé sur la grille réelle : 1 crédit = {CREDIT_FCFA} FCFA, Full HD à 2 crédits la
        seconde, montage {CREDITS_MONTAGE} crédits par vidéo.
      </p>
    </div>
  );
}
