import { describe, expect, it } from 'vitest';
import type { WordTiming } from '@/lib/transcribe/whisper';
import { SERRAGE, decouperLimport } from './decoupage';
import { ficheRythme } from './registres';

const { min: MIN, max: MAX } = ficheRythme('explainer');

/**
 * Un débit régulier : un mot toutes les `pas` secondes, sans respiration.
 *
 * Le cas le plus dur pour le découpage — il n'y a aucun silence à préférer, et
 * pourtant les plans doivent tenir dans les bornes du registre.
 */
function debitRegulier(nombre: number, pas = 0.4): WordTiming[] {
  return Array.from({ length: nombre }, (_, i) => ({
    text: `mot${i}`,
    start: i * pas,
    duration: pas * 0.8,
  }));
}

/** Le même débit, mais avec un vrai blanc après un mot donné. */
function avecBlanc(mots: WordTiming[], apres: number, blanc: number): WordTiming[] {
  return mots.map((mot, i) =>
    i > apres ? { ...mot, start: mot.start + blanc } : mot
  );
}

const total = (plans: { durationS: number }[]) =>
  plans.reduce((somme, p) => somme + p.durationS, 0);

describe('quand il n y a rien à découper', () => {
  it('rend un plan unique sur une vidéo assez courte', () => {
    // Sous le plafond du registre, il n'y a pas de raison de couper.
    const plans = decouperLimport(debitRegulier(10), MAX - 1);

    expect(plans).toHaveLength(1);
    expect(plans[0].mediaStart).toBe(0);
    expect(plans[0].durationS).toBeCloseTo(MAX - 1, 5);
  });

  it('rend un plan unique sans transcript', () => {
    // Aucun silence où couper : découper à l'aveugle vaudrait moins qu'un plan
    // franc.
    const plans = decouperLimport([], 30);

    expect(plans).toHaveLength(1);
    expect(plans[0].durationS).toBe(30);
    expect(plans[0].words).toEqual([]);
  });
});

describe('les plans taillés', () => {
  const plans = decouperLimport(debitRegulier(80), 32);

  it('couvre le fichier en entier, sans trou ni recouvrement', () => {
    // Un trou perdrait des images du client ; un recouvrement rejouerait deux
    // fois le même passage.
    expect(plans.length).toBeGreaterThan(1);
    expect(plans[0].mediaStart).toBe(0);
    expect(total(plans)).toBeCloseTo(32, 3);

    for (let i = 1; i < plans.length; i += 1) {
      expect(plans[i].mediaStart).toBeCloseTo(
        plans[i - 1].mediaStart + plans[i - 1].durationS,
        3
      );
    }
  });

  it('tient dans les bornes du registre, sauf le dernier', () => {
    // Le dernier va jusqu'au bout du fichier : c'est le reste, pas un choix.
    for (const plan of plans.slice(0, -1)) {
      expect(plan.durationS).toBeGreaterThanOrEqual(MIN - 0.5);
      expect(plan.durationS).toBeLessThanOrEqual(MAX + 0.5);
    }
  });

  it('ne perd aucun mot et n en duplique aucun', () => {
    const remis = plans.flatMap((plan) => plan.words.map((mot) => mot.text));
    expect(remis).toEqual(debitRegulier(80).map((mot) => mot.text));
  });
});

describe('les mots d un plan', () => {
  it('sont relatifs au début du plan, pas au fichier', () => {
    /*
     * C'est le contrat de la composition : `plan.ts` ajoute
     * `scene.startInSeconds` à chaque mot. Les garder absolus mettrait tous
     * les sous-titres du second plan hors de sa fenêtre, et ils ne
     * s'afficheraient jamais — en silence.
     */
    const plans = decouperLimport(debitRegulier(80), 32);
    const second = plans[1];

    expect(second.mediaStart).toBeGreaterThan(0);
    expect(second.words[0].start).toBeLessThan(MIN);
    for (const mot of second.words) {
      expect(mot.start).toBeGreaterThanOrEqual(0);
      expect(mot.start).toBeLessThanOrEqual(second.durationS);
    }
  });

  it('garde la durée de chaque mot intacte', () => {
    // Seul le début est décalé : la durée est celle du mot prononcé.
    const plans = decouperLimport(debitRegulier(80, 0.4), 32);
    for (const plan of plans) {
      for (const mot of plan.words) expect(mot.duration).toBeCloseTo(0.32, 5);
    }
  });
});

describe('où tombe la coupe', () => {
  it('préfère le plus grand silence de la fenêtre', () => {
    /*
     * Le point de tout le fichier. Une coupe au milieu d'un mot est la seule
     * chose qui se lise franchement comme une erreur ; une coupe deux secondes
     * plus tôt ou plus tard ne s'entend pas. Entre deux endroits acceptables,
     * le plus silencieux gagne.
     *
     * Ici un blanc de deux secondes est posé après le mot 12, à 5,1 s — dans
     * la fenêtre de 3 à 9 s. La première coupe doit tomber là.
     */
    const mots = avecBlanc(debitRegulier(80), 12, 2);
    const plans = decouperLimport(mots, 34);

    const finDuMot12 = mots[12].start + mots[12].duration;
    // Le blanc réel, pas celui qu'on a injecté : il s'ajoute à l'espace
    // naturel du débit.
    const blanc = mots[13].start - finDuMot12;

    // Au milieu du blanc : ni sur la queue de la syllabe, ni sur l'attaque du
    // mot suivant.
    expect(plans[0].durationS).toBeCloseTo(finDuMot12 + blanc / 2, 3);
    expect(plans[0].words).toHaveLength(13);
  });

  it('coupe quand même sur un débit sans respiration', () => {
    // Aucun silence à préférer : il faut malgré tout des plans dans les
    // bornes, sinon le montage n'a rien à monter.
    const plans = decouperLimport(debitRegulier(120, 0.25), 30);

    expect(plans.length).toBeGreaterThan(2);
    for (const plan of plans.slice(0, -1)) {
      expect(plan.durationS).toBeLessThanOrEqual(MAX + 0.5);
    }
  });
});

describe('le reste de fin', () => {
  it('rejoint le plan précédent plutôt que de faire un éclair', () => {
    /*
     * Une coupe peut tomber à 29,2 s d'un fichier de 30 s. Le reste fait alors
     * huit dixièmes de seconde, que `MIN_SCENE_ON_SCREEN_SECONDS` remonte à
     * une seconde : un plan qui passe en un éclair et se lit comme une erreur
     * de montage. C'est arrivé sur le premier import découpé.
     */
    const mots = debitRegulier(75, 0.4);
    const dureeMedia = mots[mots.length - 1].start + mots[mots.length - 1].duration + 0.4;
    const plans = decouperLimport(mots, dureeMedia);

    for (const plan of plans) {
      expect(plan.durationS).toBeGreaterThanOrEqual(MIN);
    }
    // Rien n'est perdu au passage : le fichier est couvert en entier.
    expect(total(plans)).toBeCloseTo(dureeMedia, 3);
    expect(plans.flatMap((p) => p.words).length).toBe(mots.length);
  });

  it('garde les mots du plan élargi relatifs à SON début', () => {
    // Le piège de la fusion : les mots du plan précédent sont déjà relatifs,
    // ceux du reste sont encore absolus. Les mélanger sans les remettre dans
    // le même repère décalerait la moitié des sous-titres.
    const mots = debitRegulier(75, 0.4);
    const dureeMedia = mots[mots.length - 1].start + mots[mots.length - 1].duration + 0.4;
    const plans = decouperLimport(mots, dureeMedia);
    const dernier = plans[plans.length - 1];

    for (const mot of dernier.words) {
      expect(mot.start).toBeGreaterThanOrEqual(0);
      expect(mot.start).toBeLessThanOrEqual(dernier.durationS);
    }
    // Et ils restent en ordre : une fusion qui inverse deux mots ferait
    // clignoter la ligne.
    const debuts = dernier.words.map((mot) => mot.start);
    expect([...debuts].sort((a, b) => a - b)).toEqual(debuts);
  });
});

describe('le cadrage', () => {
  it('alterne, pour qu une coupe change quelque chose', () => {
    // Une coupe entre deux plans au même cadrage n'existe pas : l'œil les
    // recolle en un seul plan. C'est tout l'intérêt du recadrage — les deux
    // effets qui rendraient la coupe visible autrement, fondu et zoom, sont
    // ceux qu'une source à bande son propre refuse.
    const plans = decouperLimport(debitRegulier(80), 32);

    for (let i = 1; i < plans.length; i += 1) {
      expect(Boolean(plans[i].reframe)).not.toBe(Boolean(plans[i - 1].reframe));
    }
  });

  it('ouvre en large', () => {
    // Une vidéo s'ouvre sur ce qu'elle montre, pas sur un détail.
    expect(decouperLimport(debitRegulier(80), 32)[0].reframe).toBeUndefined();
  });

  it('remonte le cadre serré, il ne le centre pas', () => {
    // Un visage se tient dans le tiers supérieur : un serrage centré lui coupe
    // le front avant les pieds.
    const serre = decouperLimport(debitRegulier(80), 32)[1].reframe;

    expect(serre?.scale).toBe(SERRAGE);
    expect(serre?.y).toBeGreaterThan(0);
  });

  it('reste cohérent après la fusion du reste', () => {
    // Le rang d'un plan change quand le reste rejoint son voisin. Poser le
    // cadrage au fil de l'eau laisserait alors deux voisins identiques.
    const mots = debitRegulier(75, 0.4);
    const dureeMedia = mots[mots.length - 1].start + mots[mots.length - 1].duration + 0.4;
    const plans = decouperLimport(mots, dureeMedia);

    for (let i = 1; i < plans.length; i += 1) {
      expect(Boolean(plans[i].reframe)).not.toBe(Boolean(plans[i - 1].reframe));
    }
  });
});
