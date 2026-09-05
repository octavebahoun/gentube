import {
  AnimationError,
  AnimationNotConfiguredError,
  read,
  type AnimationOutcome,
  type AnimationRequest,
  type SubmittedAnimation,
  type VideoAnimator,
} from './contract';

/**
 * Atlas Cloud — un catalogue, pas un modèle.
 *
 * **Pourquoi il entre.** Replicate rend deux modèles ; Atlas en publie près de
 * deux cents pour la seule vidéo (Wan, Seedance, Kling, Veo, Hailuo, Vidu…)
 * derrière **une seule signature**. Quand on passe ses semaines à comparer des
 * modèles, c'est la différence entre changer une variable et écrire un client.
 *
 * **Il rappelle.** `webhook_url` se pose dans le corps de la soumission, comme
 * `webhook` chez Replicate — donc `resolution: 'webhook'`. C'était la question
 * qui pouvait le disqualifier, et la réponse est bonne.
 *
 * Sa route de rappel existe — `app/api/webhooks/atlas`, signature Ed25519
 * vérifiée contre leur JWKS — donc `submitClips` l'accepte.
 *
 * **Ce qui manque encore : le prix.** Voir `TARIF_INCONNU` plus bas. Tant
 * qu'il n'est pas lu, un clip Atlas est compté à zéro et sort de la marge.
 *
 * Contrat vérifié sur la doc le 05/09/2026 : `https://www.atlascloud.ai/docs`.
 */

const DEFAULT_BASE_URL = 'https://api.atlascloud.ai/api/v1';

/**
 * Le modèle par défaut, et le seul dont le schéma d'entrée a été lu.
 *
 * Wan 2.2 image-to-video : le même modèle qu'en service chez Replicate, pour
 * que la comparaison porte sur le fournisseur et non sur le modèle.
 */
const DEFAULT_MODEL = 'atlascloud/wan-2.2/image-to-video';

/**
 * Les bornes de durée d'Atlas, qui ne sont pas celles de Replicate.
 *
 * Wan chez Replicate se demande en images (81 à 121, soit 5,06 s à 7,56 s) ;
 * chez Atlas il se demande en **secondes entières, de 3 à 10**. Les deux
 * fenêtres se recouvrent, donc un plan taillé pour Replicate passe ici — mais
 * `provider.ts` continue de décrire les bornes de Replicate, pas celles-ci.
 */
export const ATLAS_MIN_SECONDS = 3;
export const ATLAS_MAX_SECONDS = 10;

/**
 * Ce qu'Atlas nous coûte : on ne le sait pas encore, et on ne l'invente pas.
 *
 * `PROVIDER_COST_USD_PER_SECOND` porte les taux de Replicate. Les appliquer à
 * Atlas ferait une facture qui a l'air juste et qui est fausse. Atlas expose un
 * `POST /model/calculate` qui rend le prix exact du corps qu'on s'apprête à
 * envoyer, sans créer de tâche — c'est exactement ce que le contrat demande
 * (« connu avant de générer, pas après »), mais les noms de champs de sa
 * réponse ne sont pas documentés et personne ici ne les a vus.
 *
 * Donc zéro, comme Novita, et c'est le point à régler avant la production.
 */
const TARIF_INCONNU = 0;

export type AtlasConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function atlasConfig(): AtlasConfig {
  const apiKey = read('ATLAS_API_KEY');
  if (!apiKey) throw new AnimationNotConfiguredError('ATLAS_API_KEY');

  return {
    apiKey,
    baseUrl: (read('ATLAS_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: read('ATLAS_MODEL') ?? DEFAULT_MODEL,
  };
}

export function isAtlasConfigured(): boolean {
  return Boolean(read('ATLAS_API_KEY'));
}

/**
 * La durée en secondes entières, telle qu'Atlas la prend.
 *
 * Vers le haut, jamais vers le bas : arrondir 6,2 s à 6 laisserait deux
 * dixièmes de voix off sur une image arrêtée, ce qui se voit. La seconde
 * entamée est due — c'est déjà le raisonnement de p-video dans `provider.ts`.
 */
export function atlasDuration(durationS: number): number {
  const entier = Math.ceil(durationS);
  return Math.min(ATLAS_MAX_SECONDS, Math.max(ATLAS_MIN_SECONDS, entier));
}

/**
 * Le corps commun de la famille image-to-video.
 *
 * `image` en URL publique, `prompt` pour le mouvement, `resolution` aux mêmes
 * deux valeurs que notre enum — la correspondance est exacte, pas une
 * traduction. Pas de cadrage : un modèle image-to-video suit son image
 * d'entrée, le cadre est déjà joué.
 *
 * Changer `ATLAS_MODEL` pour un modèle d'une autre famille — text-to-video,
 * reference-to-video — enverrait ce corps-là à une signature qui n'en veut
 * pas. C'est la limite assumée : un seul schéma est lu, celui de Wan 2.2 i2v.
 */
function corpsDe(
  model: string,
  { imageUrl, prompt, durationS, resolution, seed, webhookUrl }: AnimationRequest
): Record<string, unknown> {
  return {
    model,
    image: imageUrl,
    prompt,
    resolution,
    duration: atlasDuration(durationS),
    ...(seed === undefined ? {} : { seed }),
    webhook_url: webhookUrl,
  };
}

export class AtlasAnimator implements VideoAnimator {
  readonly provider = 'atlas';
  /** `webhook_url` dans le corps : Atlas rappelle, comme Replicate. */
  readonly resolution = 'webhook' as const;
  /** Sa route existe et vérifie sa signature Ed25519 : `atlas-webhook.ts`. */
  readonly callbackPath = '/api/webhooks/atlas';

  constructor(private readonly config: AtlasConfig = atlasConfig()) {}

  get model(): string {
    return this.config.model;
  }

  async submit(request: AnimationRequest): Promise<SubmittedAnimation> {
    if (request.durationS <= 0) {
      throw new AnimationError('A clip needs a measured duration.', 400);
    }
    if (request.durationS > ATLAS_MAX_SECONDS) {
      throw new AnimationError(
        `Atlas cannot exceed ${ATLAS_MAX_SECONDS}s; got ${request.durationS}s.`,
        400
      );
    }

    const { model } = this.config;
    const reponse = await this.call('/model/generateVideo', {
      method: 'POST',
      body: JSON.stringify(corpsDe(model, request)),
    });

    const id = reponse.data?.id;
    if (typeof id !== 'string' || !id) {
      throw new AnimationError('Atlas returned no prediction id.');
    }

    return { externalId: id, model, costUsd: TARIF_INCONNU };
  }

  /**
   * Où en est la tâche.
   *
   * Atlas rappelle, donc c'est un filet et non le chemin : un rappel perdu
   * laisserait un job `running` avec des crédits immobilisés.
   */
  async outcome(externalId: string): Promise<AnimationOutcome> {
    let reponse: Record<string, any>;
    try {
      reponse = await this.call(`/model/prediction/${externalId}`);
    } catch (cause) {
      // Ne pas savoir n'est pas savoir que c'est raté : le GPU travaille
      // toujours de son côté, et marquer `failed` ferait repayer un clip qui
      // va arriver.
      if (cause instanceof AnimationError && cause.statusCode >= 500) {
        return { status: 'pending' };
      }
      throw cause;
    }

    return lire(reponse.data);
  }

  private async call(
    path: string,
    init: RequestInit = {}
  ): Promise<Record<string, any>> {
    let reponse: Response;
    try {
      reponse = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (cause) {
      throw new AnimationError(`Atlas is unreachable: ${cause}`, 504);
    }

    if (!reponse.ok) {
      const corps = await reponse.text();
      /*
       * Trois codes gardent leur sens propre :
       *  - 402, le solde épuisé, et 429, la limite de débit : deux pannes
       *    d'exploitation. Il faut recharger ou attendre, pas chercher un bug ;
       *  - 404, la prédiction inconnue. Le ramener à 502 le ferait passer pour
       *    une panne passagère, et `outcome()` rendrait « en cours » pour
       *    toujours sur un identifiant qui n'existe pas.
       */
      const propres = [402, 429, 404];
      const statut = propres.includes(reponse.status) ? reponse.status : 502;
      throw new AnimationError(
        `Atlas ${reponse.status}: ${corps.slice(0, 400)}`,
        statut
      );
    }

    return (await reponse.json()) as Record<string, any>;
  }
}

/**
 * Lit l'état rendu par Atlas.
 *
 * `timeout` compte comme un échec : la tâche ne reviendra pas, et la laisser en
 * attente immobiliserait les crédits pour toujours. Tout état inconnu compte
 * comme en cours — un nom d'état ajouté par le fournisseur ne doit pas faire
 * perdre un clip déjà payé.
 */
export function lire(data: unknown): AnimationOutcome {
  const bloc = (data ?? {}) as Record<string, any>;

  if (bloc.status === 'completed') {
    const videoUrl = premiereUrl(bloc.outputs);
    if (!videoUrl) {
      throw new AnimationError('Atlas completed without an output url.');
    }
    return { status: 'succeeded', videoUrl };
  }

  if (bloc.status === 'failed' || bloc.status === 'timeout') {
    const raison =
      typeof bloc.error === 'string' && bloc.error
        ? bloc.error
        : `Prediction ${bloc.status}.`;
    return { status: 'failed', error: raison };
  }

  return { status: 'pending' };
}

/** Le clip, que la sortie soit une URL nue ou un objet qui la porte. */
function premiereUrl(outputs: unknown): string | null {
  if (typeof outputs === 'string') return outputs;
  if (!Array.isArray(outputs)) return null;

  const premier = outputs[0];
  if (typeof premier === 'string') return premier;
  if (premier && typeof premier === 'object') {
    const url = (premier as Record<string, unknown>).url;
    if (typeof url === 'string') return url;
  }
  return null;
}

export function createAtlasAnimator(): VideoAnimator {
  return new AtlasAnimator();
}
