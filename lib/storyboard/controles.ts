import type { Shot } from '@/lib/db/schema';
import { apparenceDe } from './apparence';
import { dureeMinDe, qualiteDe, transitionsDe } from './registres';
import { rendersOwnContent, sceneRenderSchema } from './render';

/**
 * Les règles de qualité d'un registre.
 *
 * Des contrôles, pas des réglages : le registre déclare ce qu'il refuse — un
 * contraste minimum, un plafond de couleurs, une durée minimale — et ce fichier
 * le vérifie **avant** le rendu, jamais après.
 *
 * Quatre règles, qui valent le coup :
 *
 * - `contraste` : 4,5:1 au moins entre un texte et son fond ;
 * - `couleurs` : trois couleurs à l'écran en même temps au plus, fond exclu ;
 * - `duree` : la borne basse du rythme, sous laquelle un plan ne tient pas ;
 * - `transition` : celles que le registre s'autorise, et pas les trente-cinq.
 *
 * Chaque règle rend un verdict nommé, jamais un booléen nu : un rendu refusé
 * dit laquelle des quatre a sauté et sur quelle scène. Et le refus n'est pas
 * une exception qui remonte — le storyboard est déjà payé quand on arrive là :
 * la règle qui saute se journalise et laisse passer, comme le fait déjà le
 * contrat de rendu par plan (`signalerLeRejet` dans `render.ts`).
 */

/** Les quatre règles, par leur nom. C'est ce nom qui part dans le journal. */
export type Regle = 'contraste' | 'couleurs' | 'duree' | 'transition';

export type StatutDeControle = 'ok' | 'ko' | 'horsDePortee';

/**
 * Un verdict, jamais un booléen nu.
 *
 * `horsDePortee` n'est pas un refus : les données manquent pour juger — un
 * fond photographique dont on ne connaît pas la luminance, une durée pas
 * encore mesurée — et on le dit au lieu de deviner.
 */
export type Verdict = {
  regle: Regle;
  /** L'ordre de la scène, celui que le journal nomme. */
  scene: number;
  statut: StatutDeControle;
  /** Ce que le registre exige, en toutes lettres. */
  attendu: string;
  /** Ce que le plan porte, en toutes lettres. */
  recu: string;
  detail: string;
};

/** Ce qu'un contrôle a besoin de savoir d'une scène. `Shot` convient tel quel. */
export type PlanAControler = Pick<Shot, 'order' | 'durationS' | 'render'>;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` vaut `#aabbcc` : sans ça, la même couleur compte pour deux. */
function normaliserCouleur(couleur: string): string {
  const hex = couleur.toLowerCase();
  return hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
}

function canaux(hex: string): [number, number, number] {
  const normalisee = normaliserCouleur(hex);
  return [
    parseInt(normalisee.slice(1, 3), 16),
    parseInt(normalisee.slice(3, 5), 16),
    parseInt(normalisee.slice(5, 7), 16),
  ];
}

/**
 * Le taux de contraste WCAG entre un texte et son fond.
 *
 * Deux hexadécimaux, `#rgb` ou `#rrggbb`. Le blanc sur noir vaut 21, la même
 * couleur sur elle-même vaut 1. Une entrée qui n'est pas un hex est une faute
 * de programmation, pas une donnée du modèle : elle lève.
 */
export function tauxDeContraste(texte: string, fond: string): number {
  if (!HEX.test(texte) || !HEX.test(fond)) {
    throw new Error(`tauxDeContraste veut deux hex, reçu ${texte} sur ${fond}`);
  }
  const luminance = (hex: string): number => {
    const lineariser = (canal: number): number => {
      const part = canal / 255;
      return part <= 0.03928 ? part / 12.92 : Math.pow((part + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = canaux(hex);
    return 0.2126 * lineariser(r) + 0.7152 * lineariser(g) + 0.0722 * lineariser(b);
  };
  const clair = Math.max(luminance(texte), luminance(fond));
  const sombre = Math.min(luminance(texte), luminance(fond));
  return (clair + 0.05) / (sombre + 0.05);
}

/**
 * Les couleurs que le plan déclare lui-même, hors palette.
 *
 * Le contrat de rendu est plein de champs de couleur — `accentColor` des plans
 * structurés, `color` de l'éclair et du balayage : le modèle y écrit ce qu'il
 * veut. Seuls les hex sont comptés ; un nom ou un `rgba()` passe au travers,
 * et c'est documenté plutôt que deviné.
 */
function couleursDeclarees(render: unknown): Set<string> {
  const trouvees = new Set<string>();
  const visiter = (valeur: unknown): void => {
    if (typeof valeur === 'string') {
      if (HEX.test(valeur)) trouvees.add(normaliserCouleur(valeur));
      return;
    }
    if (Array.isArray(valeur)) {
      for (const entree of valeur) visiter(entree);
      return;
    }
    if (valeur !== null && typeof valeur === 'object') {
      for (const entree of Object.values(valeur)) visiter(entree);
    }
  };
  visiter(render);
  return trouvees;
}

type Paire = { nom: string; texte: string; fond: string };

/**
 * Les paires texte/fond qu'un plan pose lui-même.
 *
 * Enveloppe documentée, pas relevé exhaustif : le texte courant blanc sur le
 * fond noir des plans qui dessinent leur écran, le nom blanc sur l'aplat
 * d'accent du tiers, la signature et la valeur d'accent sur fond des citations
 * et des listes. Les sous-titres sur une photo n'y sont pas — un fond
 * photographique a une luminance inconnue, et deviner serait mentir.
 */
function pairesDUnPlan(
  render: unknown,
  accent: string
): Paire[] {
  const donnees = sceneRenderSchema.safeParse(render ?? {});
  if (!donnees.success) return [];
  const contrat = donnees.data;
  const paires: Paire[] = [];
  if (rendersOwnContent(render)) {
    paires.push({ nom: 'le texte courant', texte: '#ffffff', fond: '#000000' });
  }
  if (contrat.lowerThird) {
    paires.push({ nom: 'le nom du tiers', texte: '#ffffff', fond: accent });
  }
  if (contrat.quote) {
    paires.push({ nom: 'la signature', texte: accent, fond: '#000000' });
  }
  if (contrat.list) {
    paires.push({ nom: 'la valeur', texte: accent, fond: '#000000' });
  }
  return paires;
}

function controlerLaDuree(plan: PlanAControler, plancher: number): Verdict {
  const base = { regle: 'duree' as const, scene: plan.order ?? 0 };
  const secondes = Number(plan.durationS);
  if (!Number.isFinite(secondes) || secondes <= 0) {
    return {
      ...base,
      statut: 'horsDePortee',
      attendu: `au moins ${plancher} s`,
      recu: 'durée non mesurée',
      detail: 'la voix n a pas encore donné la durée de ce plan',
    };
  }
  if (secondes < plancher) {
    return {
      ...base,
      statut: 'ko',
      attendu: `au moins ${plancher} s`,
      recu: `${secondes} s`,
      detail: 'le plan tient moins longtemps que la borne basse du rythme',
    };
  }
  return {
    ...base,
    statut: 'ok',
    attendu: `au moins ${plancher} s`,
    recu: `${secondes} s`,
    detail: 'le plan tient à l écran',
  };
}

/**
 * La transition du plan est-elle une de celles que ce registre s'autorise ?
 *
 * `TRANSITIONS` en compte trente-cinq et le modèle ne choisit plus — mais rien
 * n'empêchait une fiche d'en écrire une qui jure avec son registre, ni un plan
 * de porter des effets rédigés à la main. La liste blanche de la fiche était
 * de la documentation : sans appelant, elle ne refusait rien.
 *
 * Un plan sans transition explicite n'est pas hors la loi : `habille()` en pose
 * toujours une, et un plan qui n'en porte aucune joue le `fade` par défaut de
 * la composition. C'est cette valeur-là qu'on juge, pas l'absence.
 */
function controlerLaTransition(
  plan: PlanAControler,
  autorisees: readonly string[]
): Verdict {
  const base = { regle: 'transition' as const, scene: plan.order ?? 0 };
  const attendu = autorisees.join(', ');
  const contrat = sceneRenderSchema.safeParse(plan.render ?? {});

  if (!contrat.success) {
    return {
      ...base,
      statut: 'horsDePortee',
      attendu,
      recu: 'contrat de rendu illisible',
      detail: 'le plan porte des effets que le contrat refuse, déjà signalés',
    };
  }

  // Le défaut de la composition quand le plan ne dit rien.
  const transition = contrat.data.effects?.transition ?? 'fade';

  return autorisees.includes(transition)
    ? {
        ...base,
        statut: 'ok',
        attendu,
        recu: transition,
        detail: 'la transition appartient au registre',
      }
    : {
        ...base,
        statut: 'ko',
        attendu,
        recu: transition,
        detail: 'la transition ne fait pas partie de celles que ce registre s autorise',
      };
}

function controlerLesCouleurs(
  plan: PlanAControler,
  palette: string[],
  plafond: number
): Verdict {
  const base = { regle: 'couleurs' as const, scene: plan.order ?? 0 };
  const declarees = [...couleursDeclarees(plan.render)].filter(
    (couleur) => !palette.includes(couleur)
  );
  const total = palette.length + declarees.length;
  if (total > plafond) {
    return {
      ...base,
      statut: 'ko',
      attendu: `${plafond} couleurs au plus, fond exclu`,
      recu: `${total} couleurs (${declarees.join(', ')})`,
      detail: 'le plan pose des couleurs contre la palette du registre',
    };
  }
  return {
    ...base,
    statut: 'ok',
    attendu: `${plafond} couleurs au plus, fond exclu`,
    recu:
      declarees.length === 0
        ? `${total} couleurs, la palette suffit`
        : `${total} couleurs (${declarees.join(', ')})`,
    detail: 'le plan tient dans la palette du registre',
  };
}

function controlerLeContraste(
  plan: PlanAControler,
  accent: string,
  minimum: number
): Verdict[] {
  const paires = pairesDUnPlan(plan.render, accent);
  if (paires.length === 0) {
    return [
      {
        regle: 'contraste',
        scene: plan.order ?? 0,
        statut: 'horsDePortee',
        attendu: `${minimum}:1 au moins`,
        recu: 'fond photographique',
        detail: 'la luminance d une photo ne se devine pas',
      },
    ];
  }
  return paires.map((paire) => {
    const taux = tauxDeContraste(paire.texte, paire.fond);
    const tauxLu = `${Math.round(taux * 10) / 10}:1`;
    return taux < minimum
      ? {
          regle: 'contraste' as const,
          scene: plan.order ?? 0,
          statut: 'ko' as const,
          attendu: `${minimum}:1 au moins`,
          recu: `${tauxLu} pour ${paire.nom}`,
          detail: `${paire.texte} sur ${paire.fond} ne porte pas ${paire.nom}`,
        }
      : {
          regle: 'contraste' as const,
          scene: plan.order ?? 0,
          statut: 'ok' as const,
          attendu: `${minimum}:1 au moins`,
          recu: `${tauxLu} pour ${paire.nom}`,
          detail: `${paire.nom} se lit sur son fond`,
        };
  });
}

/**
 * Les quatre règles, sur chaque plan.
 *
 * Ne lève jamais : une ligne surprenante rend un verdict `horsDePortee`, pas
 * une exception — le storyboard est déjà payé, et un contrôle ne doit pas
 * coûter la vidéo qu'il surveille.
 */
export function controlerStoryboard(
  plans: PlanAControler[],
  { registre }: { registre?: string } = {}
): Verdict[] {
  const { contrasteMin, couleursMax } = qualiteDe(registre);
  const plancher = dureeMinDe(registre);
  const transitions = transitionsDe(registre);
  const palette = Object.values(apparenceDe(registre).palette).map(normaliserCouleur);
  const accent = normaliserCouleur(apparenceDe(registre).palette.accent);

  return plans.flatMap((plan) => {
    try {
      return [
        ...controlerLeContraste(plan, accent, contrasteMin),
        controlerLesCouleurs(plan, palette, couleursMax),
        controlerLaDuree(plan, plancher),
        controlerLaTransition(plan, transitions),
      ];
    } catch {
      return [
        {
          regle: 'contraste' as const,
          scene: plan?.order ?? 0,
          statut: 'horsDePortee' as const,
          attendu: 'un plan lisible',
          recu: 'données illisibles',
          detail: 'le plan n a pas pu être contrôlé, il passe',
        },
      ];
    }
  });
}

/**
 * Dit les refus à voix haute, et laisse passer.
 *
 * Le même contrat que `signalerLeRejet` : perdre une vidéo entière pour un
 * plan est pire que perdre un plan, mais plus personne ne le perd en silence.
 * Rend le nombre de refus, pour les tests et les journaux.
 */
export function signalerLesRefus(verdicts: Verdict[]): number {
  const refus = verdicts.filter((verdict) => verdict.statut === 'ko');
  for (const verdict of refus) {
    console.warn(
      `[storyboard] contrôle refusé · plan ${verdict.scene} · ${verdict.regle} : ` +
        `${verdict.detail} (attendu ${verdict.attendu}, reçu ${verdict.recu})`
    );
  }
  return refus.length;
}
