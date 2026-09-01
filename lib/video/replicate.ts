import type { Ratio, Resolution } from '@/lib/db/schema';
import {
  AnimationError,
  AnimationNotConfiguredError,
  read,
  type AnimationOutcome,
  type AnimationRequest,
  type SubmittedAnimation,
  type VideoAnimator,
} from './contract';
import {
  MODELS,
  WAN_FPS,
  billedSeconds,
  clipCostUsd,
  maxClipSeconds,
  modelFor,
  wanFrames,
} from './provider';

/**
 * Replicate — le seul fournisseur de clips en service.
 *
 * Le choix contre un GPU dédié est argumenté dans `docs/providers.md` : des
 * modèles toujours chauds, une facturation par sortie connue avant de générer,
 * les exécutions échouées non facturées, et surtout les quinze clips d'une
 * vidéo qui partent en parallèle au lieu de faire la queue sur une carte.
 *
 * Rien ici n'attend un clip. On soumet, on rend l'identifiant de prédiction,
 * et le webhook de `app/api/webhooks/replicate` résout le job.
 */

const DEFAULT_BASE_URL = 'https://api.replicate.com/v1';

export type ReplicateConfig = {
  token: string;
  baseUrl: string;
};

export function replicateConfig(): ReplicateConfig {
  const token = read('REPLICATE_API_TOKEN');
  if (!token) throw new AnimationNotConfiguredError('REPLICATE_API_TOKEN');

  return {
    token,
    baseUrl: (read('REPLICATE_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
  };
}

export function isAnimationConfigured(): boolean {
  try {
    replicateConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Les entrées propres à chaque modèle, et rien d'autre dans ce fichier ne les
 * connaît. C'est le seul endroit à rouvrir quand un modèle change de signature
 * ou quand un troisième entre en service.
 */
function inputFor(
  model: string,
  { imageUrl, prompt, durationS, resolution, ratio, seed }: AnimationRequest
): Record<string, unknown> {
  const common = {
    image: imageUrl,
    prompt,
    resolution,
    ...(seed === undefined ? {} : { seed }),
  };

  if (model === MODELS.pVideo) {
    return {
      ...common,
      // Entier obligatoire côté modèle : `billedSeconds` fait l'arrondi, et
      // c'est le même que celui du prix, pour qu'ils ne divergent jamais.
      duration: billedSeconds(resolution, durationS),
      aspect_ratio: ratio,
      // Le mode brouillon est à 0,005 $/s. Le prix étant fixé avant la
      // génération, un client ne peut pas se voir livrer un brouillon.
      draft: false,
    };
  }

  // Wan n'a pas de paramètre de cadrage : il suit l'image d'entrée. Sa durée,
  // elle, se demande en images — sans quoi il rend ses 5,06 s d'usine et la
  // voix off finit sur une image arrêtée.
  return {
    ...common,
    num_frames: wanFrames(durationS),
    frames_per_second: WAN_FPS,
    // Wan rend en 16 fps quand le reste du montage tourne à 24 : la saccade se
    // voit. L'interpolation ffmpeg monte la sortie à 30 fps sans toucher ni à
    // la durée ni au prix, qui se comptent tous deux à 16 fps.
    interpolate_output: true,
  };
}

export class ReplicateAnimator implements VideoAnimator {
  constructor(private readonly config: ReplicateConfig = replicateConfig()) {}

  async submit(request: AnimationRequest): Promise<SubmittedAnimation> {
    const { durationS, resolution } = request;

    if (durationS <= 0) {
      throw new AnimationError('A clip needs a measured duration.', 400);
    }
    // Le plafond dépend du modèle : 7,56 s pour Wan, 10 s pour p-video. Une
    // scène plus longue se découpe en deux — la ralentir pour couvrir la voix
    // se verrait à l'écran.
    const ceiling = maxClipSeconds(resolution);
    if (durationS > ceiling) {
      throw new AnimationError(
        `A ${resolution} clip cannot exceed ${ceiling}s; got ${durationS}s.`,
        400
      );
    }

    const model = modelFor(resolution);

    const response = await this.call(`/models/${model}/predictions`, {
      method: 'POST',
      body: JSON.stringify({
        input: inputFor(model, request),
        webhook: request.webhookUrl,
        // Seul l'état final nous intéresse : les événements intermédiaires
        // multiplieraient les appels sans rien apprendre au job.
        webhook_events_filter: ['completed'],
      }),
    });

    const id = typeof response.id === 'string' ? response.id : null;
    if (!id) {
      throw new AnimationError(`Replicate returned no prediction id.`);
    }

    return { externalId: id, model, costUsd: clipCostUsd(resolution, durationS) };
  }

  async outcome(externalId: string): Promise<AnimationOutcome> {
    const prediction = await this.call(`/predictions/${externalId}`);
    const status = prediction.status;

    if (status === 'succeeded') {
      const videoUrl = firstUrl(prediction.output);
      if (!videoUrl) {
        throw new AnimationError('Replicate succeeded without an output url.');
      }
      return { status: 'succeeded', videoUrl };
    }

    if (status === 'failed' || status === 'canceled') {
      return {
        status: 'failed',
        error:
          typeof prediction.error === 'string' && prediction.error
            ? prediction.error
            : `Prediction ${status}.`,
      };
    }

    return { status: 'pending' };
  }

  private async call(
    path: string,
    init: RequestInit = {}
  ): Promise<Record<string, any>> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (cause) {
      throw new AnimationError(`Replicate is unreachable: ${cause}`, 504);
    }

    if (!response.ok) {
      const body = await response.text();
      // 402 vaut la peine d'être distingué : Replicate ne coupe pas net quand
      // le crédit s'épuise, il ralentit d'abord (`docs/providers.md`). Un 402
      // qui remonte jusqu'ici veut dire que le rechargement automatique a
      // échoué, pas qu'un plan est mal formé.
      throw new AnimationError(
        `Replicate ${response.status}: ${body.slice(0, 400)}`,
        response.status === 402 ? 402 : 502
      );
    }

    return (await response.json()) as Record<string, any>;
  }
}

/** Le clip, que le modèle le rende seul ou dans une liste d'une entrée. */
function firstUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && typeof output[0] === 'string') return output[0];
  return null;
}

export function createReplicateAnimator(): ReplicateAnimator {
  return new ReplicateAnimator();
}
