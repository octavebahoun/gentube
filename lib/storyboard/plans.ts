import { z } from 'zod';

/**
 * Les plans dont le contenu est une **donnée**, et non un texte rédigé.
 *
 * C'est le palier 3 du catalogue : une scène ne connaît d'ordinaire qu'un
 * prompt visuel et une narration ; ceux-ci portent une valeur, deux lignes de
 * rangs différents, une série. Le storyboard doit donc savoir les décrire, et
 * le modèle les produire.
 *
 * Ils vivent à part de `render.ts` parce qu'ils grossissent vite et que ce
 * fichier-là est lu par tout le moteur. La règle qui les gouverne tous : **un
 * champ par information, jamais une chaîne à redécouper**.
 */

export const sceneCounterSchema = z.object({
  /** La valeur d'arrivée. C'est elle que le spectateur retient. */
  value: z.number(),
  /** Le départ. Zéro sauf si la progression elle-même veut dire quelque chose. */
  from: z.number().optional(),
  /** Ce que le chiffre compte. Sans lui, un nombre nu ne dit rien. */
  label: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  decimals: z.number().int().min(0).max(3).optional(),
  /** `count` monte en chiffres, `ring` remplit un anneau autour d'eux. */
  variant: z.enum(['count', 'ring']).optional(),
  startInSeconds: z.number().min(0).optional(),
  durationInSeconds: z.number().positive().optional(),
});

/**
 * Le tiers inférieur : qui parle, et à quel titre.
 *
 * `overlayText` ne porte qu'une chaîne, et c'est précisément ce qui lui
 * manque ici. Un tiers inférieur porte **deux** informations de rangs
 * différents — un nom et une fonction — et le rendu doit savoir laquelle
 * grossir. Passer « Kofi Mensah, agronome » dans un seul champ oblige la
 * page à redécouper la chaîne pour deviner la hiérarchie ; elle devinerait
 * mal dès la première virgule dans un titre.
 *
 * Premier champ du contrat dont le contenu est structuré plutôt que rédigé.
 */
export const lowerThirdSchema = z.object({
  /** La ligne forte. Un nom de personne, de lieu, de source. */
  name: z.string(),
  /** La ligne faible : fonction, date, provenance. */
  role: z.string().optional(),
  /** `bar` souligne, `stack` empile sans filet, `boxed` pose un cartouche. */
  variant: z.enum(['bar', 'stack', 'boxed', 'bild']).optional(),
  side: z.enum(['left', 'right']).optional(),
  accentColor: z.string().optional(),
  startInSeconds: z.number().min(0).optional(),
  /**
   * Combien de temps il reste à l'écran.
   *
   * Un tiers inférieur sort, contrairement au bandeau : il annonce
   * quelqu'un, il n'accompagne pas le plan. Sans valeur, il tient trois
   * secondes — ou jusqu'à la fin de la scène si elle est plus courte.
   */
  holdSeconds: z.number().positive().optional(),
});

/**
 * Un graphique.
 *
 * Le premier plan du catalogue dont le contenu est une **série** et non une
 * valeur. Le compteur porte un nombre, le tiers inférieur deux lignes ; ici il
 * faut des couples étiquette/valeur, et leur ordre compte — c'est lui que
 * l'œil lit.
 *
 * Trois à six entrées. En dessous, un compteur dit la même chose plus fort ;
 * au-delà, les étiquettes ne tiennent plus dans un cadre vertical, où la
 * moitié de nos vidéos sont vues.
 *
 * Comme le compteur, il ne coûte que sa voix off : rien n'est généré.
 */
export const chartSchema = z.object({
  /** `bar` compare des quantités, `line` montre une évolution. */
  kind: z.enum(['bar', 'line']).optional(),
  /** Ce que le graphique dit, en une ligne. Sans lui, des chiffres nus. */
  title: z.string().optional(),
  /**
   * Les points, dans l'ordre où ils doivent être lus.
   *
   * `label` est court : c'est une étiquette d'axe, pas une phrase. En 9:16
   * elle a la largeur d'un doigt.
   */
  points: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
      })
    )
    .min(2)
    .max(6),
  /**
   * La valeur haute de l'échelle.
   *
   * Omise, c'est la plus grande valeur de la série. On la pose quand l'échelle
   * elle-même veut dire quelque chose — un pourcentage va jusqu'à 100 même si
   * aucune barre ne l'atteint, sinon la plus haute paraît pleine.
   */
  max: z.number().positive().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  decimals: z.number().int().min(0).max(3).optional(),
  accentColor: z.string().optional(),
  startInSeconds: z.number().min(0).optional(),
  durationInSeconds: z.number().positive().optional(),
});

/**
 * Un fil de discussion.
 *
 * Le plan structuré le plus proche de ce que le modèle sait déjà écrire : des
 * répliques. C'est aussi le seul dont l'ordre porte le sens — un message qui
 * répond avant d'être lu ne veut rien dire.
 *
 * Deux à cinq messages. En dessous ce n'est pas une conversation, au-delà les
 * bulles ne tiennent plus dans un cadre vertical, et l'oeil n'a de toute façon
 * pas le temps de lire plus en un plan.
 *
 * Comme le compteur et le graphique, il ne coûte que sa voix off.
 */
export const threadSchema = z.object({
  /** Le salon, le groupe, l'application. Une ligne, en haut. */
  title: z.string().optional(),
  messages: z
    .array(
      z.object({
        /** Qui parle. Un prénom ou un pseudo, pas une phrase. */
        from: z.string(),
        /**
         * Ce qui est dit. Court : une bulle qui déborde de trois lignes ne se
         * lit pas en trois secondes de plan.
         */
        text: z.string().max(140),
        /**
         * La réplique de « notre » côté, alignée à droite.
         *
         * C'est ce qui fait qu'un fil se lit comme une conversation et non
         * comme une liste : sans un côté et un autre, le regard ne sait pas
         * qui répond à qui.
         */
        mine: z.boolean().optional(),
      })
    )
    .min(2)
    .max(5),
  accentColor: z.string().optional(),
  startInSeconds: z.number().min(0).optional(),
  /** L'écart entre deux messages. C'est lui qui donne le rythme de la lecture. */
  stepSeconds: z.number().positive().max(2).optional(),
});
