import type { Quality, Ratio } from '@/lib/db/schema';

/**
 * Ce que l'étape « plan animé » attend d'un fournisseur, et rien de plus.
 *
 * Le contrat vit à part des implémentations pour la même raison que celui de
 * la voix : il y aura plusieurs modèles derrière (`docs/providers.md` en
 * retient trois), et le métier ne doit jamais savoir lequel a répondu.
 *
 * Une différence de forme avec la voix, et elle est structurante : la voix
 * rend son audio dans l'appel, un clip met une minute. La génération est donc
 * **soumise**, pas attendue — `jobs.external_id` porte l'identifiant renvoyé,
 * et c'est le webhook du fournisseur qui résout le job. Aucune requête Vercel
 * ne reste ouverte pendant qu'un GPU travaille.
 */

export type AnimationRequest = {
  /**
   * L'image fixe de la scène, en URL publique lisible par le fournisseur —
   * `shots.source_image_url`. Tous les modèles retenus font de l'image-to-video :
   * le cadrage est déjà joué, le clip ne fait que l'animer.
   */
  imageUrl: string;
  /** Le mouvement voulu, pas le contenu : celui-ci est déjà dans l'image. */
  prompt: string;
  /**
   * Secondes. Vient de la mesure Edge TTS, jamais d'une estimation : c'est la
   * durée que le client a payée sur le bouton de validation.
   */
  durationS: number;
  /** Le palier vendu : `draft` ou `standard`. Les deux rendent en 1080p. */
  quality: Quality;
  ratio: Ratio;
  /** Fixe le bruit initial : deux appels de même graine rendent le même clip. */
  seed?: number;
  /** Où le fournisseur rappelle quand le clip est prêt. */
  webhookUrl: string;
};

export type SubmittedAnimation = {
  /** Identifiant côté fournisseur. Va dans `jobs.external_id`, qui est unique. */
  externalId: string;
  /** Le modèle qui a accepté la tâche. Tracé pour que la facture s'explique. */
  model: string;
  /** Ce que ce clip nous coûtera, en USD. Connu avant de générer, pas après. */
  costUsd: number;
};

export type AnimationOutcome =
  | { status: 'pending' }
  | { status: 'succeeded'; videoUrl: string }
  | { status: 'failed'; error: string };

/**
 * Comment le clip d'un fournisseur finit par arriver.
 *
 * **C'est la seule différence entre deux fournisseurs qui casse en silence.**
 * Replicate rappelle : on soumet, on rend la main, son webhook résout le job.
 * Novita ne rappelle pas : il faut lui redemander où il en est. Un fournisseur
 * sans webhook branché comme s'il en avait un laisse ses jobs `running` pour
 * toujours, sans erreur nulle part — les crédits restent immobilisés et
 * personne ne sait pourquoi.
 *
 * D'où cette propriété sur le contrat plutôt qu'une convention : celui qui
 * orchestre lit ici ce qu'il doit faire après avoir soumis.
 */
export type ResolutionMode = 'webhook' | 'poll';

export interface VideoAnimator {
  /** Le nom du fournisseur, pour que le journal et la facture s'expliquent. */
  readonly provider: string;
  /** Qui résout la tâche : son webhook, ou nous en redemandant. */
  readonly resolution: ResolutionMode;
  /**
   * La route qui lit les rappels de CE fournisseur, ou `null` s'il n'y en a
   * pas encore.
   *
   * Déclarer `resolution: 'webhook'` dit qu'un fournisseur rappelle ; ça ne dit
   * pas qu'on sait l'écouter. Chaque fournisseur signe et met en forme sa
   * charge à sa façon — Replicate son HMAC, Atlas de l'Ed25519 sur un JWKS —
   * et une route ne sait lire que celui pour lequel elle est écrite. Sans ce
   * champ, un nouveau fournisseur qui rappelle recevrait l'adresse de la route
   * d'un autre : les clips partent, sont facturés, et aucun ne revient.
   */
  readonly callbackPath: string | null;
  /** Lance la génération et rend de quoi la retrouver. Ne l'attend pas. */
  submit(request: AnimationRequest): Promise<SubmittedAnimation>;
  /**
   * Où en est la tâche.
   *
   * Pour un fournisseur en `webhook`, c'est un filet : le rappel peut se
   * perdre — un déploiement au mauvais moment suffit — et un job resté
   * `running` immobilise des crédits déjà débités.
   *
   * Pour un fournisseur en `poll`, c'est **le** chemin : il n'y en a pas
   * d'autre.
   *
   * Un incident réseau rend `pending` et non `failed` : ne pas savoir n'est
   * pas la même chose que savoir que c'est raté, et le GPU travaille toujours
   * de son côté.
   */
  outcome(externalId: string): Promise<AnimationOutcome>;
}

export class AnimationNotConfiguredError extends Error {
  readonly statusCode = 503;

  constructor(missing: string) {
    super(`Video generation is not configured: ${missing} is missing.`);
    this.name = 'AnimationNotConfiguredError';
  }
}

export class AnimationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'AnimationError';
    this.statusCode = statusCode;
  }
}

export function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Nom d'étape porté par `jobs.step` pour un clip. Un job par plan animé —
 * `jobs.external_id` étant unique, un webhook rejoué ne peut en résoudre
 * qu'un seul.
 */
export const ANIMATE_STEP = 'animate';

/**
 * Ce que le job d'animation garde de sa scène, dans `jobs.payload`.
 *
 * Le webhook n'a que l'identifiant de prédiction ; c'est ici qu'il retrouve
 * quelle scène habiller. L'ordre y figure en plus de l'id parce que le nom du
 * fichier sur R2 est bâti sur l'ordre (`docs/contrats.md` §3).
 */
export type AnimationJobPayload = {
  shotId: number;
  order: number;
  model: string;
  costUsd: number;
};
