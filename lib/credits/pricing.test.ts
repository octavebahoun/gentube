import { describe, expect, it } from 'vitest';
import {
  CREDITS_PER_SECOND,
  PLAN_MONTHLY_CREDITS,
  TOPUP_PACKS,
  creditsForShot,
  estimateVideoCredits,
  secondsAffordable,
  topUpMarginFcfa,
} from './pricing';

describe('credit pricing', () => {
  it('takes a still at 480p as the unit', () => {
    expect(CREDITS_PER_SECOND.image['480p']).toBe(1);
    expect(creditsForShot(5, 'image', '480p')).toBe(5);
  });

  it('charges an animated shot twice a still', () => {
    // Une minute de clips nous coûte ~400 FCFA contre ~30 pour des images
    // fixes. Facturer les deux pareil faisait payer aux clients « diaporama »
    // le tarif de la vidéo générée.
    expect(CREDITS_PER_SECOND.video['480p']).toBe(
      CREDITS_PER_SECOND.image['480p'] * 2
    );
    expect(creditsForShot(5, 'video', '480p')).toBe(10);
  });

  it('multiplies both types by three at 720p', () => {
    expect(CREDITS_PER_SECOND.image['720p']).toBe(3);
    expect(CREDITS_PER_SECOND.video['720p']).toBe(6);
    expect(creditsForShot(5, 'video', '720p')).toBe(30);
  });

  it('rounds each shot up, not the total', () => {
    // 2,4 s + 2,4 s facturés comme 3 + 3, pas 5.
    expect(
      estimateVideoCredits(
        [
          { durationS: 2.4, type: 'image' },
          { durationS: 2.4, type: 'image' },
        ],
        '480p'
      )
    ).toBe(6);
  });

  it('prices a mixed storyboard shot by shot, not on its total length', () => {
    // C'est tout l'intérêt du changement : deux storyboards de même durée
    // n'ont pas le même prix si l'un bouge et l'autre non.
    const mixed = [
      { durationS: 6, type: 'video' as const },
      { durationS: 8, type: 'image' as const },
      { durationS: 5, type: 'video' as const },
      { durationS: 6, type: 'image' as const },
    ];
    expect(estimateVideoCredits(mixed, '480p')).toBe(12 + 8 + 10 + 6);
    expect(estimateVideoCredits(mixed, '720p')).toBe(36 + 24 + 30 + 18);

    const stills = mixed.map((shot) => ({ ...shot, type: 'image' as const }));
    expect(estimateVideoCredits(stills, '480p')).toBeLessThan(
      estimateVideoCredits(mixed, '480p')
    );
  });

  it('estimates an empty storyboard at zero', () => {
    expect(estimateVideoCredits([], '480p')).toBe(0);
  });

  it('rejects a non-positive duration', () => {
    expect(() => creditsForShot(0, 'image', '480p')).toThrow(RangeError);
    expect(() => creditsForShot(-3, 'video', '480p')).toThrow(RangeError);
    expect(() => creditsForShot(Number.NaN, 'image', '720p')).toThrow(RangeError);
  });

  it('converts a balance into affordable seconds, per type', () => {
    expect(secondsAffordable(100, 'image', '480p')).toBe(100);
    expect(secondsAffordable(100, 'video', '480p')).toBe(50);
    expect(secondsAffordable(100, 'video', '720p')).toBe(16);
  });

  it('keeps plan allowances aligned with the minutes advertised in docs/tarifs.md', () => {
    // Les dotations sont exprimées dans l'unité image, donc une minute animée
    // en consomme deux fois plus. Starter ≈ 22 min animées, Pro ≈ 45 min.
    const animatedMinutes = (credits: number) =>
      Math.round(secondsAffordable(credits, 'video', '480p') / 60);
    expect(animatedMinutes(PLAN_MONTHLY_CREDITS.starter)).toBe(22);
    expect(animatedMinutes(PLAN_MONTHLY_CREDITS.pro)).toBe(45);

    // Et le double en images fixes, ce qui est l'argument de vente du
    // pipeline image.
    expect(secondsAffordable(PLAN_MONTHLY_CREDITS.starter, 'image', '480p')).toBe(
      secondsAffordable(PLAN_MONTHLY_CREDITS.starter, 'video', '480p') * 2
    );
  });

  it('prices 720p above its real cost ratio instead of subsidizing it', () => {
    // Le 720p coûte réellement ~2,1× le 480p (docs/tarifs.md) ; facturé 3×,
    // il dégage de la marge au lieu d'être subventionné par le 480p.
    for (const type of ['image', 'video'] as const) {
      expect(
        CREDITS_PER_SECOND[type]['720p'] / CREDITS_PER_SECOND[type]['480p']
      ).toBeGreaterThanOrEqual(2.1);
    }
  });

  it('keeps the top-up pack profitable even if spent entirely on clips', () => {
    // 5 000 FCFA = 720 crédits, soit 6 min animées. La marge est calculée au
    // pire cas : un pack rentable ici l'est quel que soit l'usage réel.
    expect(topUpMarginFcfa(TOPUP_PACKS[0])).toBeGreaterThan(0);
  });

  it('charges the same for an animated minute as before the revision', () => {
    // Le changement rend l'image moins chère ; il ne doit pas rendre la vidéo
    // plus chère. 22 min animées valaient 15 000 FCFA, elles les valent
    // toujours.
    expect(secondsAffordable(PLAN_MONTHLY_CREDITS.starter, 'video', '480p')).toBe(
      1_320
    );
  });
});
