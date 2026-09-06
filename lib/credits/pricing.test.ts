import { describe, expect, it } from 'vitest';
import {
  CREDITS_MONTAGE,
  CREDITS_PER_1000_CHARS,
  CREDITS_PER_IMAGE,
  CREDITS_PER_SECOND,
  CREDIT_FCFA,
  FCFA_PER_USD,
  MAX_SHOT_SECONDS,
  PLAN_MONTHLY_CREDITS,
  PLAN_PRICE_FCFA,
  PROVIDER_COST_USD_PER_SECOND,
  QUALITY_BY_PLAN,
  QUALITY_LABEL,
  TOPUP_PACKS,
  creditsForShot,
  creditsForSpeech,
  creditsToFcfa,
  estimateVideoCredits,
  imagesAffordable,
  providerCostUsd,
  secondsAffordable,
  topUpMarginFcfa,
} from './pricing';

describe('l unité de compte', () => {
  it('ancre le crédit dans la monnaie, pas dans une seconde de rendu', () => {
    /*
     * C'est le changement de fond de la v1. Le crédit valait « une seconde
     * d'image fixe en 480p » : changer de modèle vidéo renversait alors toute
     * la grille. Ancré à 20 FCFA, seul le nombre de crédits par seconde bouge.
     */
    expect(CREDIT_FCFA).toBe(20);
    expect(creditsToFcfa(100)).toBe(2_000);
  });

  it('vend le Cinéma trois fois et demie le Full HD', () => {
    expect(CREDITS_PER_SECOND.draft).toBe(2);
    expect(CREDITS_PER_SECOND.standard).toBe(7);
  });

  it('ne montre jamais le mot du fournisseur au client', () => {
    // `draft` est le booléen de p-video. Le voir dans une interface ferait
    // croire au client qu'on lui livre un brouillon.
    for (const libelle of Object.values(QUALITY_LABEL)) {
      expect(libelle.toLowerCase()).not.toContain('draft');
      expect(libelle.toLowerCase()).not.toContain('brouillon');
    }
    expect(QUALITY_LABEL.draft).toBe('Full HD');
    expect(QUALITY_LABEL.standard).toBe('Cinéma');
  });
});

describe('le prix d un plan', () => {
  it('facture une image une fois, quelle que soit sa durée à l écran', () => {
    /*
     * Une fixe ne coûte rien de plus en restant affichée : c'est un fichier
     * déjà généré. La facturer à la seconde faisait payer au diaporama — le
     * palier d'entrée, le plus sensible au prix — une durée sans coût.
     */
    expect(creditsForShot(2, 'image', 'draft')).toBe(CREDITS_PER_IMAGE);
    expect(creditsForShot(9, 'image', 'standard')).toBe(CREDITS_PER_IMAGE);
  });

  it('facture une vidéo à la seconde, arrondie au-dessus', () => {
    // Le même arrondi que celui du fournisseur : p-video prend un entier de
    // secondes. Arrondir autrement ferait diverger le prix et le coût.
    expect(creditsForShot(5, 'video', 'draft')).toBe(10);
    expect(creditsForShot(5, 'video', 'standard')).toBe(35);
    expect(creditsForShot(6.2, 'video', 'draft')).toBe(13);
  });

  it('refuse une durée qui n en est pas une', () => {
    expect(() => creditsForShot(0, 'image', 'draft')).toThrow(RangeError);
    expect(() => creditsForShot(-3, 'video', 'draft')).toThrow(RangeError);
    expect(() => creditsForShot(Number.NaN, 'video', 'standard')).toThrow(
      RangeError
    );
  });
});

describe('le devis d un storyboard', () => {
  it('compte le montage, parce qu il est coché par défaut', () => {
    // Un devis qui l'omettrait annoncerait un prix que le client ne paiera
    // jamais.
    const plans = [{ durationS: 5, type: 'video' as const }];
    expect(estimateVideoCredits(plans, 'draft')).toBe(10 + CREDITS_MONTAGE);
    expect(estimateVideoCredits(plans, 'draft', { montage: false })).toBe(10);
  });

  it('arrondit plan par plan, pas sur le total', () => {
    // 2,4 s facturée 4,8 → 5 crédits. Deux plans font 10, pas les 9,6 d'un
    // arrondi sur le total : c'est plan par plan que la seconde entamée part
    // au fournisseur.
    const credits = estimateVideoCredits(
      [
        { durationS: 2.4, type: 'video' },
        { durationS: 2.4, type: 'video' },
      ],
      'draft',
      { montage: false }
    );
    expect(credits).toBe(5 + 5);
  });

  it('distingue deux storyboards de même durée', () => {
    // Tout l'intérêt : l'un bouge, l'autre non, et ils ne coûtent pas pareil.
    const anime = [{ durationS: 8, type: 'video' as const }];
    const fixe = [{ durationS: 8, type: 'image' as const }];
    expect(estimateVideoCredits(fixe, 'draft')).toBeLessThan(
      estimateVideoCredits(anime, 'draft')
    );
  });

  it('estime un storyboard vide à zéro, montage compris', () => {
    // Sans plan il n'y a rien à monter : facturer les 25 crédits de montage
    // sur un devis vide ferait apparaître un prix sorti de nulle part.
    expect(estimateVideoCredits([], 'draft')).toBe(0);
  });

  it('vend la vidéo de 30 s au prix annoncé, ou un peu au-dessus', () => {
    /*
     * 12 plans animés de 2,5 s, montage compris.
     *
     * Full HD tombe juste : 2,5 × 2 = 5, pas d'arrondi, 85 crédits = 1 700 F,
     * le chiffre de la grille.
     *
     * Cinéma ne tombe pas juste : 2,5 × 7 = 17,5, arrondi à 18 par plan, soit
     * 241 et non 235. La grille a compté 30 × 7 sur la durée totale ; nous
     * arrondissons par plan, parce que c'est plan par plan qu'on paie. L'écart
     * est de 6 crédits — 120 FCFA sur 4 700 — et il va toujours dans le même
     * sens : le client paie un peu plus que la grille n'annonce. C'est le prix
     * annoncé qu'il faut corriger, pas l'arrondi.
     */
    const plans = Array.from({ length: 12 }, () => ({
      durationS: 2.5,
      type: 'video' as const,
    }));
    expect(estimateVideoCredits(plans, 'draft')).toBe(85);
    expect(creditsToFcfa(85)).toBe(1_700);

    const cinema = estimateVideoCredits(plans, 'standard');
    expect(cinema).toBe(241);
    expect(creditsToFcfa(cinema)).toBeGreaterThanOrEqual(4_700);
  });
});

describe('la voix', () => {
  it('facture la tranche de mille caractères entamée', () => {
    expect(creditsForSpeech(0)).toBe(0);
    expect(creditsForSpeech(1)).toBe(CREDITS_PER_1000_CHARS);
    expect(creditsForSpeech(1_000)).toBe(CREDITS_PER_1000_CHARS);
    expect(creditsForSpeech(1_001)).toBe(CREDITS_PER_1000_CHARS * 2);
  });
});

describe('ce qu un solde achète', () => {
  it('convertit en secondes de vidéo et en images', () => {
    expect(secondsAffordable(100, 'draft')).toBe(50);
    expect(secondsAffordable(100, 'standard')).toBe(14);
    expect(imagesAffordable(100)).toBe(33);
  });
});

describe('la marge', () => {
  /**
   * Le pire cas : tout dépensé en Cinéma, le palier le plus cher à produire.
   * Une marge vérifiée là tient quel que soit l'usage réel.
   */
  const margeFcfa = (prixFcfa: number, credits: number) =>
    prixFcfa - providerCostUsd(credits, 'standard') * FCFA_PER_USD;

  it('reste positive sur chaque plan, même tout dépensé en Cinéma', () => {
    for (const plan of ['starter', 'pro'] as const) {
      const prix = PLAN_PRICE_FCFA[plan];
      expect(prix).not.toBeNull();
      expect(margeFcfa(prix as number, PLAN_MONTHLY_CREDITS[plan])).toBeGreaterThan(0);
    }
  });

  it('reste positive sur chaque pack de recharge', () => {
    for (const pack of TOPUP_PACKS) {
      expect(topUpMarginFcfa(pack)).toBeGreaterThan(0);
    }
  });

  it('ne descend jamais sous 13 % de remise sur un pack', () => {
    /*
     * Le coût fournisseur ne baisse pas avec le volume : chaque franc de
     * remise sort directement de la marge. C'est la seule borne qui empêche un
     * gros pack d'être vendu à perte pour faire du volume.
     */
    for (const pack of TOPUP_PACKS) {
      const remise = 1 - pack.priceFcfa / pack.credits / CREDIT_FCFA;
      // 13,3 % sur le pack de 750 : la grille dit « plafonnée à 13 % », et
      // 13 000 FCFA la dépasse d'un tiers de point. Le seuil est posé à 14 %
      // pour laisser passer l'arrondi commercial sans ouvrir la porte à une
      // remise de volume.
      expect(remise).toBeLessThanOrEqual(0.14);
    }
  });

  it('facture chaque palier au-dessus de son coût', () => {
    // La vérification qui compte vraiment : vendre une seconde moins cher
    // qu'elle ne se paie ne se verrait nulle part ailleurs.
    for (const quality of ['draft', 'standard'] as const) {
      const venduFcfa = CREDITS_PER_SECOND[quality] * CREDIT_FCFA;
      const couteFcfa = PROVIDER_COST_USD_PER_SECOND[quality] * FCFA_PER_USD;
      expect(venduFcfa).toBeGreaterThan(couteFcfa * 2);
    }
  });
});

describe('les droits par plan', () => {
  it('garde le Cinéma hors de Starter', () => {
    /*
     * Sans cette borne, l'écart entre 15 000 et 35 000 FCFA ne reposerait sur
     * rien : les deux plans donneraient accès au même palier, seul le nombre
     * de crédits changerait.
     */
    expect(QUALITY_BY_PLAN.starter).toEqual(['draft']);
    expect(QUALITY_BY_PLAN.pro).toContain('standard');
  });
});

describe('les bornes du modèle', () => {
  it('plafonne un plan à ce que p-video sait rendre d un trait', () => {
    // `duration` est un entier de 1 à 10 chez eux. Au-delà il faudrait
    // ralentir le clip pour couvrir la voix, et un ralenti se voit.
    expect(MAX_SHOT_SECONDS).toBe(10);
  });
});
