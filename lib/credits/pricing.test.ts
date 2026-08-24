import { describe, expect, it } from 'vitest';
import {
  CREDITS_PER_SECOND,
  PLAN_MONTHLY_CREDITS,
  TOPUP_PACKS,
  creditsForShot,
  estimateVideoCredits,
  providerCostUsd,
  secondsAffordable,
  topUpMarginFcfa,
} from './pricing';

describe('credit pricing', () => {
  it('prices 1 credit per second at 480p (specs §1)', () => {
    expect(CREDITS_PER_SECOND['480p']).toBe(1);
    expect(creditsForShot(5, '480p')).toBe(5);
  });

  it('prices 4 credits per second at 720p', () => {
    expect(CREDITS_PER_SECOND['720p']).toBe(4);
    expect(creditsForShot(5, '720p')).toBe(20);
  });

  it('rounds each shot up, not the total', () => {
    // 2,4 s + 2,4 s facturés comme 3 + 3, pas 5.
    expect(estimateVideoCredits([{ durationS: 2.4 }, { durationS: 2.4 }], '480p')).toBe(6);
  });

  it('sums a whole storyboard', () => {
    const storyboard = [
      { durationS: 6 },
      { durationS: 8 },
      { durationS: 5 },
      { durationS: 6 },
    ];
    expect(estimateVideoCredits(storyboard, '480p')).toBe(25);
    expect(estimateVideoCredits(storyboard, '720p')).toBe(100);
  });

  it('estimates an empty storyboard at zero', () => {
    expect(estimateVideoCredits([], '480p')).toBe(0);
  });

  it('rejects a non-positive duration', () => {
    expect(() => creditsForShot(0, '480p')).toThrow(RangeError);
    expect(() => creditsForShot(-3, '480p')).toThrow(RangeError);
    expect(() => creditsForShot(Number.NaN, '480p')).toThrow(RangeError);
  });

  it('converts a balance into affordable seconds', () => {
    expect(secondsAffordable(100, '480p')).toBe(100);
    expect(secondsAffordable(100, '720p')).toBe(25);
    expect(secondsAffordable(3, '720p')).toBe(0);
  });

  it('keeps plan allowances aligned with the minutes advertised in the specs', () => {
    // Starter ≈ 22 min en 480p, Pro ≈ 50 min — voir la note dans pricing.ts.
    expect(Math.round(secondsAffordable(PLAN_MONTHLY_CREDITS.starter, '480p') / 60)).toBe(22);
    expect(Math.round(secondsAffordable(PLAN_MONTHLY_CREDITS.pro, '480p') / 60)).toBe(50);
  });

  it('keeps the 480p and 720p credit rates in line with provider cost', () => {
    // Les mêmes crédits doivent correspondre à peu près au même coût USD aux
    // deux résolutions, sinon une résolution subventionne silencieusement
    // l'autre.
    const at480 = providerCostUsd(100, '480p');
    const at720 = providerCostUsd(100, '720p');
    expect(Math.abs(at480 - at720) / at480).toBeLessThan(0.05);
  });

  it('flags the top-up pack as loss-making at the specified rate', () => {
    // Documente un problème connu du cahier des charges au lieu de le
    // déclarer normal : si jamais ce chiffre devient positif, la tarification
    // a été corrigée et la note dans pricing.ts peut disparaître.
    expect(topUpMarginFcfa(TOPUP_PACKS[0])).toBeLessThan(0);
  });
});
