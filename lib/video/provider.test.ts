import { describe, expect, it } from 'vitest';
import {
  MODELS,
  P_VIDEO_MAX_SECONDS,
  P_VIDEO_MIN_SECONDS,
  P_VIDEO_RESOLUTION,
  billedSeconds,
  clipCostUsd,
  maxClipSeconds,
  minClipSeconds,
  modelFor,
} from './provider';
import {
  FCFA_PER_USD,
  PROVIDER_COST_USD_PER_SECOND,
} from '@/lib/credits/pricing';

describe('modelFor', () => {
  it('ne connaît plus qu un modèle', () => {
    /*
     * Wan est sorti de la v1. Il facturait au clip, avec un plancher de 81
     * images — 5,06 s — qui obligeait le storyboard à refuser toute scène plus
     * courte et faisait payer 5 s une scène de 3.
     */
    expect(modelFor()).toBe(MODELS.pVideo);
    expect(Object.keys(MODELS)).toEqual(['pVideo']);
  });

  it('rend en 1080p quel que soit le palier vendu', () => {
    // Ce qui sépare Full HD de Cinéma est le booléen `draft`, pas le nombre de
    // pixels : les deux clients reçoivent le même cadre.
    expect(P_VIDEO_RESOLUTION).toBe('1080p');
  });
});

describe('les bornes d une scène', () => {
  it('n a plus de plancher', () => {
    /*
     * C'est le gain de fond du changement de modèle. Le plancher de Wan
     * façonnait toute la grammaire du storyboard : une narration de moins de
     * cinq secondes était interdite, sans quoi deux secondes de mouvement
     * étaient générées, payées, puis jetées à la composition.
     */
    expect(minClipSeconds()).toBe(1);
    expect(P_VIDEO_MIN_SECONDS).toBe(1);
  });

  it('plafonne à dix secondes, la borne du modèle', () => {
    expect(maxClipSeconds()).toBe(10);
    expect(P_VIDEO_MAX_SECONDS).toBe(10);
  });

  it('garde le plancher sous le plafond', () => {
    // Une inversion rendrait toute scène impossible, et l'erreur ne se verrait
    // qu'au premier storyboard refusé sans raison lisible.
    expect(minClipSeconds()).toBeLessThan(maxClipSeconds());
  });
});

describe('billedSeconds', () => {
  it('arrondit à la seconde entamée, comme la requête', () => {
    // `duration` est un entier chez eux : une narration de 6,2 s part à 7, et
    // la seconde entamée est due.
    expect(billedSeconds(6.2)).toBe(7);
    expect(billedSeconds(3)).toBe(3);
    expect(billedSeconds(0.4)).toBe(1);
  });

  it('facture la seconde réelle, sans palier de clip', () => {
    // Wan facturait 5,06 s pour une scène de 3. La différence était perdue.
    expect(billedSeconds(3)).toBeLessThan(billedSeconds(5));
  });
});

describe('clipCostUsd', () => {
  it('applique le taux de pricing.ts, source unique', () => {
    for (const quality of ['draft', 'standard'] as const) {
      expect(clipCostUsd(quality, 5)).toBeCloseTo(
        5 * PROVIDER_COST_USD_PER_SECOND[quality],
        10
      );
    }
  });

  it('fait payer le Cinéma quatre fois le Full HD', () => {
    // C'est l'écart de coût réel, et c'est lui qui justifie l'écart de prix
    // vendu — 2 crédits contre 7 la seconde.
    expect(clipCostUsd('standard', 5) / clipCostUsd('draft', 5)).toBeCloseTo(4, 6);
  });

  it('garde un clip de dix secondes sous les 250 FCFA', () => {
    /*
     * Le plan le plus cher possible : dix secondes de Cinéma. À 0,04 $/s cela
     * fait 0,40 $, soit 250 FCFA — vendus 70 crédits, donc 1 400 FCFA. Un
     * dépassement ici voudrait dire que le tarif du fournisseur a bougé sans
     * que la grille suive.
     */
    const pireCas = clipCostUsd('standard', P_VIDEO_MAX_SECONDS) * FCFA_PER_USD;
    expect(pireCas).toBeLessThanOrEqual(250);
  });
});
