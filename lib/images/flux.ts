import type { Ratio, Resolution } from '@/lib/db/schema';
import { dimensionsFor } from '@/lib/storyboard/render';

/**
 * Images fixes — FLUX sur Cloudflare Workers AI.
 *
 * Le modèle est `flux-2-klein-4b` et non `flux-1-schnell`, pour une seule
 * raison qui décide de tout : **schnell ne prend pas de dimensions** et rend
 * du carré 1024×1024. Un carré dans une trame 16:9 se recadre, donc on
 * paierait des pixels pour les jeter, et le sujet cadré par le prompt sortirait
 * du champ une fois sur deux. klein prend `width`/`height`, donc on génère
 * exactement la trame.
 *
 * Deux pièges vérifiés contre l'API réelle, pas contre la documentation :
 *
 *  - **Le corps est du multipart/form-data**, pas du JSON. Un POST JSON répond
 *    « required properties at '/' are 'multipart' », ce qui ne dit pas du tout
 *    qu'il faut changer d'encodage.
 *  - **Les dimensions sont rabotées au multiple de 16 inférieur.** Demander
 *    854×480 renvoie 848×480, sans le signaler. C'est pourquoi les trames de
 *    `dimensionsFor()` sont toutes des multiples de 16.
 *
 * Et un piège qui coûte de l'argent : le modèle accepte un **prompt vide** et
 * facture l'image de bruit qu'il renvoie. La validation est donc ici, pas
 * chez le fournisseur.
 */

const DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const DEFAULT_BASE_URL = 'https://api.cloudflare.com/client/v4';

/** Limite du modèle, vérifiée : au-delà l'API répond « max width is 2048 ». */
const MAX_DIMENSION = 2048;
const MAX_PROMPT_LENGTH = 2_048;

/**
 * Coût de sortie, en USD par tuile de 512×512 (tarif Workers AI de
 * `flux-2-klein-4b`). Une trame 848×480 fait 1,55 tuile, une trame 1280×720
 * en fait 3,52 — donc environ 0,0004 $ et 0,001 $ l'image. Trois ordres de
 * grandeur sous un clip animé : c'est ce qui justifie que le plan image soit
 * facturé moitié prix.
 */
export const COST_USD_PER_TILE = 0.000287;
const TILE = 512 * 512;

export class ImageNotConfiguredError extends Error {
  readonly statusCode = 503;

  constructor(missing: string) {
    super(`Image generation is not configured: ${missing} is missing.`);
    this.name = 'ImageNotConfiguredError';
  }
}

export class ImageError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'ImageError';
    this.statusCode = statusCode;
  }
}

export type ImageConfig = {
  accountId: string;
  token: string;
  model: string;
  baseUrl: string;
};

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function imageConfig(): ImageConfig {
  const accountId = read('CLOUDFLARE_ACCOUNT_ID');
  if (!accountId) throw new ImageNotConfiguredError('CLOUDFLARE_ACCOUNT_ID');
  const token = read('CLOUDFLARE_AI_TOKEN');
  if (!token) throw new ImageNotConfiguredError('CLOUDFLARE_AI_TOKEN');

  return {
    accountId,
    token,
    model: read('CLOUDFLARE_IMAGE_MODEL') ?? DEFAULT_MODEL,
    baseUrl: (read('CLOUDFLARE_AI_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
  };
}

export function isImageConfigured(): boolean {
  try {
    imageConfig();
    return true;
  } catch {
    return false;
  }
}

/** Prix de sortie d'une image de cette taille, en USD. */
export function imageCostUsd(width: number, height: number): number {
  return ((width * height) / TILE) * COST_USD_PER_TILE;
}

export type GeneratedImage = {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
};

export type ImageRequest = {
  prompt: string;
  ratio: Ratio;
  resolution: Resolution;
  /** Fixe le bruit initial : deux appels de même graine rendent la même image. */
  seed?: number;
};

export interface ImageGenerator {
  generate(request: ImageRequest): Promise<GeneratedImage>;
}

export class WorkersAiImageClient implements ImageGenerator {
  constructor(private readonly config: ImageConfig = imageConfig()) {}

  async generate({
    prompt,
    ratio,
    resolution,
    seed,
  }: ImageRequest): Promise<GeneratedImage> {
    const described = prompt.trim();
    if (!described) {
      // Le modèle rend une image de bruit et la facture. Refuser ici est la
      // seule barrière.
      throw new ImageError('Nothing to draw: the visual prompt is empty.', 400);
    }

    const { width, height } = dimensionsFor(ratio, resolution);
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new ImageError(
        `Frame ${width}×${height} exceeds the model limit of ${MAX_DIMENSION}px.`,
        400
      );
    }

    const form = new FormData();
    form.set('prompt', described.slice(0, MAX_PROMPT_LENGTH));
    form.set('width', String(width));
    form.set('height', String(height));
    if (seed !== undefined) {
      if (!Number.isInteger(seed) || seed < 0) {
        // L'API répond « Invalid input » sans dire quel champ : autant le dire.
        throw new ImageError(`Seed must be a non-negative integer, got ${seed}.`, 400);
      }
      form.set('seed', String(seed));
    }

    const response = await fetch(
      `${this.config.baseUrl}/accounts/${this.config.accountId}/ai/run/${this.config.model}`,
      {
        method: 'POST',
        // Volontairement pas de Content-Type : fetch pose lui-même la frontière
        // multipart, et l'écraser rend le corps illisible pour le serveur.
        headers: { Authorization: `Bearer ${this.config.token}` },
        body: form,
      }
    );

    const body = await response.text();

    if (!response.ok) {
      throw new ImageError(
        `Workers AI returned HTTP ${response.status}: ${errorDetail(body)}`,
        response.status === 429 ? 429 : 502
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new ImageError('Workers AI returned an answer we cannot read.');
    }

    // Un 200 peut porter `success: false` : le HTTP décrit l'appel, pas
    // l'inférence.
    const envelope = payload as {
      success?: boolean;
      result?: { image?: unknown };
      errors?: unknown;
    };
    if (envelope.success === false) {
      throw new ImageError(`Workers AI refused the prompt: ${errorDetail(body)}`);
    }

    const image = envelope.result?.image;
    if (typeof image !== 'string' || image.length === 0) {
      throw new ImageError('Workers AI returned no image for this scene.');
    }

    return {
      bytes: Buffer.from(image, 'base64'),
      contentType: 'image/jpeg',
      width,
      height,
    };
  }
}

/** Extrait un message lisible, sans jamais renvoyer la requête — elle porte le jeton. */
function errorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { errors?: { message?: string }[] };
    const messages = (parsed.errors ?? [])
      .map((error) => error?.message)
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) return messages.join('; ').slice(0, 300);
  } catch {
    // Corps non-JSON : on garde l'extrait brut.
  }
  return body.slice(0, 300);
}

export function createImageClient(): WorkersAiImageClient {
  return new WorkersAiImageClient(imageConfig());
}
