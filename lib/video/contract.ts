import type { Ratio, Resolution } from '@/lib/db/schema';

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
  resolution: Resolution;
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

export interface VideoAnimator {
  /** Lance la génération et rend de quoi la retrouver. Ne l'attend pas. */
  submit(request: AnimationRequest): Promise<SubmittedAnimation>;
  /**
   * Filet, pas le chemin normal. Le webhook peut se perdre — un déploiement au
   * mauvais moment suffit — et un job resté `running` immobilise des crédits
   * déjà débités. Une reprise périodique redemande ici où en est la tâche.
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
