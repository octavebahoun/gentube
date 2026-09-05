import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  controlerStoryboard,
  signalerLesRefus,
  tauxDeContraste,
  type PlanAControler,
} from './controles';

function plan(surcouche: Partial<PlanAControler> = {}): PlanAControler {
  return { order: 1, durationS: 5, render: {}, ...surcouche };
}

function verdictsDe(surcouche: Partial<PlanAControler> = {}) {
  return controlerStoryboard([plan(surcouche)]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('le taux de contraste', () => {
  it('vaut 21 entre le blanc et le noir, 1 d une couleur sur elle-même', () => {
    expect(tauxDeContraste('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(tauxDeContraste('#ce1f20', '#ce1f20')).toBe(1);
  });

  it('lit l accent du registre au-dessus du seuil, pas son second', () => {
    // Le nom blanc sur l'aplat rouge passe ; le même sur le filet orange des
    // tiers ne passerait pas — c'est pour dire ça que la règle existe.
    expect(tauxDeContraste('#ffffff', '#ce1f20')).toBeGreaterThanOrEqual(4.5);
    expect(tauxDeContraste('#ffffff', '#ff5a36')).toBeLessThan(4.5);
  });

  it('refuse ce qui n est pas un hex plutôt que de deviner', () => {
    expect(() => tauxDeContraste('rouge', '#000000')).toThrow();
  });
});

describe('la durée minimale', () => {
  it('dit la règle et la scène quand le plan est trop court', () => {
    // Sous trois secondes une phrase n'a pas fini d'être comprise : c'est la
    // borne basse du rythme, la troisième règle.
    const verdict = verdictsDe({ durationS: 2 }).find((v) => v.regle === 'duree');
    expect(verdict?.statut).toBe('ko');
    expect(verdict?.scene).toBe(1);
  });

  it('laisse passer un plan qui tient, et ne juge pas sans mesure', () => {
    expect(verdictsDe({ durationS: 5 }).find((v) => v.regle === 'duree')?.statut).toBe('ok');
    expect(verdictsDe({ durationS: 0 }).find((v) => v.regle === 'duree')?.statut).toBe(
      'horsDePortee'
    );
  });
});

describe('la liste blanche de transitions', () => {
  const transitionDe = (surcouche: Partial<PlanAControler> = {}) =>
    verdictsDe(surcouche).find((v) => v.regle === 'transition');

  it('laisse passer une transition du registre', () => {
    expect(transitionDe({ render: { effects: { transition: 'push-left' } } })?.statut).toBe(
      'ok'
    );
  });

  it('refuse une des trente-cinq autres, et la nomme', () => {
    // Le modèle ne choisit plus, mais un plan peut porter des effets rédigés
    // à la main — et la liste ne refusait rien tant qu'elle n'avait pas
    // d'appelant.
    const verdict = transitionDe({ render: { effects: { transition: 'whip-pan' } } });

    expect(verdict?.statut).toBe('ko');
    expect(verdict?.recu).toBe('whip-pan');
    expect(verdict?.attendu).toContain('push-left');
  });

  it('juge le fondu par défaut quand le plan ne dit rien', () => {
    // L'absence de transition n'est pas hors la loi : la composition joue
    // `fade`, et c'est cette valeur-là qui doit être dans la liste.
    expect(transitionDe()?.statut).toBe('ok');
    expect(transitionDe()?.recu).toBe('fade');
  });

  it('ne juge pas un contrat de rendu illisible', () => {
    // Déjà signalé ailleurs par `signalerLeRejet` : le redire en refus de
    // transition serait un second reproche pour la même faute.
    expect(
      transitionDe({ render: { effects: { zoom: 'vers-la-lune' } } })?.statut
    ).toBe('horsDePortee');
  });
});

describe('le plafond de couleurs', () => {
  it('tient dans la palette tant que le plan ne déclare rien', () => {
    const verdict = verdictsDe().find((v) => v.regle === 'couleurs');
    expect(verdict?.statut).toBe('ok');
    expect(verdict?.recu).toContain('3 couleurs');
  });

  it('nomme la règle, la scène et la quatrième couleur', () => {
    const verdict = verdictsDe({ render: { flash: { color: '#00e5ff' } } }).find(
      (v) => v.regle === 'couleurs'
    );
    expect(verdict?.statut).toBe('ko');
    expect(verdict?.scene).toBe(1);
    expect(verdict?.recu).toContain('4 couleurs');
    expect(verdict?.recu).toContain('#00e5ff');
  });

  it('ne compte pas deux fois une couleur déjà dans la palette', () => {
    // La casse ne fait pas une couleur de plus.
    const verdict = verdictsDe({
      render: { lowerThird: { name: 'Kofi Mensah', accentColor: '#CE1F20' } },
    }).find((v) => v.regle === 'couleurs');
    expect(verdict?.statut).toBe('ok');
  });
});

describe('le contraste par plan', () => {
  it('lit le texte courant sur le fond des plans qui dessinent leur écran', () => {
    const verdict = verdictsDe({ render: { counter: { value: 12 } } }).find(
      (v) => v.regle === 'contraste'
    );
    expect(verdict?.statut).toBe('ok');
    expect(verdict?.recu).toContain('21:1');
  });

  it('refuse la signature d accent sur fond, et dit laquelle', () => {
    // L'auteur d'une citation en rouge sur noir ne passe pas 4,5:1 : le
    // contrôle le dit avant le rendu, et laisse passer.
    const refuse = verdictsDe({ render: { quote: { text: 'Une phrase.' } } }).find(
      (v) => v.regle === 'contraste' && v.statut === 'ko'
    );
    expect(refuse?.scene).toBe(1);
    expect(refuse?.recu).toContain('signature');
  });

  it('avoue quand le fond est une photo plutôt que de deviner', () => {
    const verdict = verdictsDe().find((v) => v.regle === 'contraste');
    expect(verdict?.statut).toBe('horsDePortee');
  });
});

describe('le journal des refus', () => {
  it('journalise sans lever, et rend le nombre de refus', () => {
    const avertir = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const verdicts = controlerStoryboard([
      plan({ order: 1, durationS: 2 }),
      plan({ order: 2, durationS: 5 }),
    ]);

    expect(() => signalerLesRefus(verdicts)).not.toThrow();
    expect(signalerLesRefus(verdicts)).toBe(1);
    expect(avertir.mock.calls.join('\n')).toContain('plan 1');
    expect(avertir.mock.calls.join('\n')).toContain('duree');
  });

  it('ne lève jamais, même sur une ligne surprenante', () => {
    expect(() =>
      controlerStoryboard([{ order: 9, durationS: NaN, render: null } as unknown as PlanAControler])
    ).not.toThrow();
  });
});
