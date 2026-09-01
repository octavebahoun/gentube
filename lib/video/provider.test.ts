import { describe, expect, it } from 'vitest';
import { PROVIDER_COST_USD_PER_SECOND } from '@/lib/credits/pricing';
import {
  MODELS,
  P_VIDEO_MAX_SECONDS,
  WAN_MAX_SECONDS,
  WAN_MIN_SECONDS,
  billedSeconds,
  clipCostUsd,
  maxClipSeconds,
  modelFor,
  wanFrames,
} from './provider';

describe('modelFor', () => {
  it('donne le 480p à Wan et le 720p à p-video', () => {
    expect(modelFor('480p')).toBe(MODELS.wan);
    expect(modelFor('720p')).toBe(MODELS.pVideo);
  });
});

describe('wanFrames', () => {
  it('demande le nombre d\'images qui couvre la narration', () => {
    expect(wanFrames(7)).toBe(112); // 7 s × 16 fps
    expect(wanFrames(6.5)).toBe(104);
  });

  it('ne descend jamais sous le bloc minimal du modèle', () => {
    // 81 images est un plancher dur : en dessous Wan refuse. Une scène de 3 s
    // se paie donc 5,06 s, et c'est exactement là que la marge se perd.
    expect(wanFrames(3)).toBe(81);
    expect(wanFrames(0.1)).toBe(81);
  });

  it('ne dépasse jamais le bloc maximal du modèle', () => {
    expect(wanFrames(9)).toBe(121);
    expect(wanFrames(60)).toBe(121);
  });

  it('couvre exactement la scène la plus longue admise', () => {
    expect(wanFrames(WAN_MAX_SECONDS)).toBe(121);
    expect(wanFrames(WAN_MIN_SECONDS)).toBe(81);
  });
});

describe('maxClipSeconds', () => {
  it('plafonne le 480p au bloc de Wan, pas aux dix secondes de p-video', () => {
    expect(maxClipSeconds('480p')).toBeCloseTo(7.5625, 4);
    expect(maxClipSeconds('720p')).toBe(P_VIDEO_MAX_SECONDS);
  });
});

describe('billedSeconds', () => {
  it('facture Wan à la durée rendue, pas par paliers de clip', () => {
    // Wan compte à la seconde ramenée à 16 fps : 7 s coûtent 7 s, pas 10.
    expect(billedSeconds('480p', 7)).toBeCloseTo(7, 4);
  });

  it('facture le plancher de Wan sur une scène plus courte', () => {
    expect(billedSeconds('480p', 3)).toBeCloseTo(WAN_MIN_SECONDS, 4);
  });

  it('arrondit p-video à la seconde entamée, comme sa requête', () => {
    expect(billedSeconds('720p', 6.2)).toBe(7);
    expect(billedSeconds('720p', 5)).toBe(5);
  });
});

describe('clipCostUsd', () => {
  it('applique le taux de pricing.ts, source unique', () => {
    expect(clipCostUsd('480p', 7)).toBeCloseTo(
      7 * PROVIDER_COST_USD_PER_SECOND.video['480p'],
      6
    );
    expect(clipCostUsd('720p', 6.2)).toBeCloseTo(
      7 * PROVIDER_COST_USD_PER_SECOND.video['720p'],
      6
    );
  });

  it('reste sous le prix du clip de référence annoncé', () => {
    // docs/providers.md : 0,05 $ le clip de 5 s en 480p.
    expect(clipCostUsd('480p', 5)).toBeLessThanOrEqual(0.051);
  });
});
