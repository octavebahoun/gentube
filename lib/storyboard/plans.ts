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
  /**
   * `count` monte en chiffres, `ring` remplit un anneau autour d'eux, `wheel`
   * fait rouler chaque chiffre à sa place comme un compteur mécanique.
   *
   * `wheel` ne convient qu'aux entiers : une roue de décimales tourne trop
   * vite pour se lire, et le point flotterait entre deux colonnes.
   */
  variant: z.enum(['count', 'ring', 'wheel']).optional(),
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
  /**
   * L'apparence.
   *
   * `bar` souligne, `stack` empile sans filet, `boxed` pose un cartouche.
   *
   * Les neuf suivantes viennent du palier 2, qui les demandait comme neuf
   * champs séparés — `ltCleanBar`, `ltSoftPill`, `ltNeonBorder`… Ce sont des
   * apparences du même objet : deux lignes de rangs différents, posées bas à
   * gauche ou à droite. Neuf champs auraient voulu dire neuf balisages, neuf
   * schémas et neuf entrées de prompt pour un contenu identique — et le
   * modèle aurait eu à choisir entre neuf noms plutôt qu'entre neuf allures.
   */
  variant: z
    .enum([
      'bar',
      'stack',
      'boxed',
      'bild',
      'clean-bar',
      'soft-pill',
      'color-block',
      'bold-block',
      'accent-underline',
      'kicker-name',
      'mask-reveal',
      'neon-border',
      'stack-bars',
    ])
    .optional(),
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
        /**
         * Les trois points, à la place du texte.
         *
         * Ce que tout le monde reconnaît sans qu'on l'explique : quelqu'un
         * écrit. C'est le seul message dont le `text` ne sert pas — il reste
         * exigé pour que le storyboard dise quand même ce qui allait être dit.
         */
        typing: z.boolean().optional(),
      })
    )
    .min(2)
    .max(5),
  accentColor: z.string().optional(),
  startInSeconds: z.number().min(0).optional(),
  /** L'écart entre deux messages. C'est lui qui donne le rythme de la lecture. */
  stepSeconds: z.number().positive().max(2).optional(),
});

/**
 * Une citation.
 *
 * Trois informations de rangs différents — ce qui est dit, qui l'a dit, à quel
 * titre — et c'est exactement pourquoi elle est ici et non dans `overlayText`.
 * « La terre ne ment pas — Kofi Mensah, agronome » dans une seule chaîne
 * oblige la page à retrouver les coupures, et elle les rate dès qu'une virgule
 * apparaît dans la phrase citée.
 *
 * Le plan le plus courant du contenu sans visage après le compteur, et le
 * moins cher avec lui : aucune image générée.
 */
export const quoteSchema = z.object({
  /** Ce qui est dit. Sans guillemets : la mise en page les pose. */
  text: z.string().max(240),
  /** Qui l'a dit. */
  author: z.string().optional(),
  /** À quel titre. La ligne faible, sous le nom. */
  role: z.string().optional(),
  /** `mark` pose un gros guillemet, `rule` un filet, `plain` ni l'un ni l'autre. */
  variant: z.enum(['mark', 'rule', 'plain']).optional(),
  accentColor: z.string().optional(),
  startInSeconds: z.number().min(0).optional(),
  durationInSeconds: z.number().positive().optional(),
});

/**
 * Une liste.
 *
 * Le format le plus courant du contenu sans visage — « les cinq chiffres
 * de… », « trois raisons de… » — et pourtant celui qu'on n'avait pas. Un
 * `kineticTitle` ne sait dire qu'une phrase ; ici chaque ligne est une
 * information, et leur ordre est ce que la narration suit.
 *
 * Deux à six lignes. Une liste de sept ne se lit pas en un plan, et la
 * septième sort du cadre en 9:16.
 */
export const listSchema = z.object({
  title: z.string().optional(),
  items: z
    .array(
      z.object({
        /** La ligne. Courte : ce n'est pas une phrase de narration. */
        text: z.string().max(80),
        /**
         * Le chiffre ou le mot fort qu'on pose à droite.
         *
         * Une chaîne et non un nombre : c'est une étiquette — « 12 000 »,
         * « x3 », « 2 h » — et la mettre en forme ici serait deviner.
         */
        value: z.string().max(16).optional(),
      })
    )
    .min(2)
    .max(6),
  /** Numérotée plutôt que pastillée. Vrai quand l'ordre est un classement. */
  ordered: z.boolean().optional(),
  /**
   * Comment les lignes se rangent.
   *
   * Huit champs du palier 2 — `trustStrip`, `swipeRail`, `radialSurround`,
   * `constellationHub`, `multiDeviceSplay`, `markerChecklistCard`,
   * `newsTicker`, `beatTimeline` — demandaient tous la même chose : une suite
   * de choses nommées. Ce qui les distingue est la **disposition**, pas le
   * contenu. Une ligne reste une ligne : un texte, une valeur facultative.
   */
  layout: z
    .enum([
      'column',
      'rail',
      'strip',
      'ring',
      'hub',
      'splay',
      'checklist',
      'ticker',
      'timeline',
    ])
    .optional(),
  /** Une étiquette courte posée avant le titre. Le « DIRECT » d'un bandeau. */
  label: z.string().max(24).optional(),
  accentColor: z.string().optional(),
  startInSeconds: z.number().min(0).optional(),
  /** L'écart entre deux lignes. C'est lui qui cale la liste sur la voix. */
  stepSeconds: z.number().positive().max(2).optional(),
});

/**
 * Une comparaison en deux colonnes.
 *
 * Avant et après, nous et eux, l'ancien prix et le nouveau. Le sens ne vient
 * pas des lignes mais de leur **face-à-face** : les mêmes lignes en une seule
 * liste ne diraient rien.
 *
 * Une à quatre lignes par côté, et les deux côtés se remplissent ensemble —
 * une comparaison où un côté arriverait en premier se lirait comme deux
 * listes.
 */
export const comparisonSchema = z.object({
  title: z.string().optional(),
  left: z.object({
    label: z.string().max(24),
    items: z.array(z.string().max(60)).min(1).max(4),
  }),
  right: z.object({
    label: z.string().max(24),
    items: z.array(z.string().max(60)).min(1).max(4),
  }),
  accentColor: z.string().optional(),
  startInSeconds: z.number().min(0).optional(),
  stepSeconds: z.number().positive().max(2).optional(),
});
