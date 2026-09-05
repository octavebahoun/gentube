import type { Registre } from './registres';

/**
 * L'apparence d'un registre : sa palette et son échelle.
 *
 * **Pourquoi un fichier séparé.** La table des registres porte déjà le rythme,
 * les transitions et le style visuel ; la palette et les quatre ratios de
 * police l'auraient faite déborder, et `composition.ts` est à 490 lignes pour
 * une limite de 500 à 600. Ce fichier ne connaît que des valeurs — c'est
 * `composition.ts` qui les pose sur le document.
 *
 * **Ce que la palette couvre, et ce qu'elle ne couvre pas.** Trois couleurs :
 * le rouge de la marque, son second pour les filets et les lueurs, la craie
 * des tracés manuscrits. Les signatures des variantes — le cyan-magenta du
 * `neon`, le vert du `matrix`, l'orange `#ff6b2b` du `highlight` appuyé —
 * restent dans `style.css` : elles disent quelle variante est rendue, pas
 * quel registre la porte.
 */

export type Palette = {
  /** Le rouge de la marque. Pastilles, barres, aplats, points. */
  accent: string;
  /** Filets, lueurs, tiers inférieur. */
  accentSecondaire: string;
  /** Tracés manuscrits, craie sur pellicule. */
  encre: string;
};

export type Echelle = {
  /** Sous-titres, en fraction de la hauteur de trame. */
  sousTitre: number;
  /** Filigrane, en fraction de la hauteur de trame. */
  filigrane: number;
  /** Plans structurés — citation, fil, liste — en fraction de trame. */
  structure: number;
  /** Chiffres de la roue, en fraction de trame. */
  roue: number;
};

export type Apparence = {
  palette: Palette;
  echelle: Echelle;
};

/**
 * `explainer` : palette sourde, échelle posée.
 *
 * Les quatre ratios sont ceux que `composition.ts` écrivait en dur, et les
 * trois couleurs celles que `style.css` répétait : le rouge `#ce1f20` sur les
 * pastilles, les barres et les aplats, `#ff5a36` sur les tiers, `#ffd9a0` sur
 * les tracés. Les recopier ici à l'identique, c'est garantir qu'un `explainer`
 * composé demain rend le même pixel qu'hier.
 */
const EXPLAINER: Apparence = {
  palette: {
    accent: '#ce1f20',
    accentSecondaire: '#ff5a36',
    encre: '#ffd9a0',
  },
  echelle: {
    sousTitre: 0.058,
    filigrane: 0.032,
    structure: 0.042,
    roue: 0.16,
  },
};

const APPARENCES: Record<Registre, Apparence> = {
  explainer: EXPLAINER,
};

/** L'apparence d'un registre, `explainer` si le nom est inconnu. */
export function apparenceDe(registre?: string): Apparence {
  return APPARENCES[(registre ?? '') as Registre] ?? EXPLAINER;
}

/** Les quatre tailles en pixels, pour une hauteur de trame donnée. */
export function echelleEnPx(
  apparence: Apparence,
  hauteur: number
): { sousTitre: number; filigrane: number; structure: number; roue: number } {
  return {
    sousTitre: Math.round(hauteur * apparence.echelle.sousTitre),
    filigrane: Math.round(hauteur * apparence.echelle.filigrane),
    structure: Math.round(hauteur * apparence.echelle.structure),
    roue: Math.round(hauteur * apparence.echelle.roue),
  };
}

/**
 * Les variables posées sur la racine du document.
 *
 * La composition les écrit en `style` sur `#root` et ses règles les lisent
 * avec un repli à la valeur d'hier — `var(--gt-accent, #ce1f20)` — donc une
 * page composée sans elles rend exactement pareil.
 */
export function texteDesVariables(registre?: string, hauteur?: number): string {
  const apparence = apparenceDe(registre);
  const variables: Array<[string, string]> = [
    ['--gt-accent', apparence.palette.accent],
    ['--gt-accent-2', apparence.palette.accentSecondaire],
    ['--gt-encre', apparence.palette.encre],
  ];
  if (hauteur !== undefined) {
    const tailles = echelleEnPx(apparence, hauteur);
    variables.push(
      ['--gt-sous-titre', `${tailles.sousTitre}px`],
      ['--gt-filigrane', `${tailles.filigrane}px`],
      ['--gt-structure', `${tailles.structure}px`],
      ['--gt-roue', `${tailles.roue}px`]
    );
  }
  return variables.map(([nom, valeur]) => `${nom}: ${valeur};`).join(' ');
}
