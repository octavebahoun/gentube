/**
 * Transcription — Whisper sur Cloudflare Workers AI.
 *
 * **Pourquoi elle existe.** Le cas d'usage « le client apporte sa vidéo » veut
 * des sous-titres calés au mot. Pour une vidéo générée, ces timings viennent
 * d'Edge TTS, qui sait ce qu'il a prononcé et quand. Pour une vidéo tournée,
 * personne ne le sait : il faut écouter la bande.
 *
 * **Pourquoi Cloudflare.** Le compte est déjà là pour les images
 * (`CLOUDFLARE_AI_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), donc aucun fournisseur de
 * plus à ouvrir, à facturer, ni à mettre en panne. Le modèle est
 * `whisper-large-v3-turbo`, le seul de leur catalogue qui rende des bornes
 * **par mot** — et non par segment de dix secondes, qui ne servirait à rien
 * pour du karaoké.
 *
 * **La forme de sortie n'est pas négociable** : `{ text, start, duration }`
 * par mot, en secondes depuis le début. C'est exactement ce que la colonne
 * `shots.words` porte et ce que la composition lit, pour que des sous-titres
 * transcrits et des sous-titres synthétisés soient indistinguables en aval.
 */

const DEFAULT_MODEL = '@cf/openai/whisper-large-v3-turbo';
const DEFAULT_BASE_URL = 'https://api.cloudflare.com/client/v4';

/**
 * Le plafond de Workers AI sur une requête, en octets.
 *
 * Vingt-cinq mégaoctets d'audio, soit environ vingt-cinq minutes en MP3 à
 * 128 kbit/s. Une vidéo pèse bien plus que sa bande son : c'est **l'audio
 * extrait** qu'on envoie, jamais le fichier vidéo.
 */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export class TranscriptionNotConfiguredError extends Error {
  readonly statusCode = 503;

  constructor(missing: string) {
    super(`Transcription is not configured: ${missing} is missing.`);
    this.name = 'TranscriptionNotConfiguredError';
  }
}

export class TranscriptionError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'TranscriptionError';
    this.statusCode = statusCode;
  }
}

export type TranscriptionConfig = {
  accountId: string;
  token: string;
  model: string;
  baseUrl: string;
};

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function transcriptionConfig(): TranscriptionConfig {
  const accountId = read('CLOUDFLARE_ACCOUNT_ID');
  if (!accountId) throw new TranscriptionNotConfiguredError('CLOUDFLARE_ACCOUNT_ID');
  const token = read('CLOUDFLARE_AI_TOKEN');
  if (!token) throw new TranscriptionNotConfiguredError('CLOUDFLARE_AI_TOKEN');

  return {
    accountId,
    token,
    model: read('CLOUDFLARE_TRANSCRIBE_MODEL') ?? DEFAULT_MODEL,
    baseUrl: (read('CLOUDFLARE_AI_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
  };
}

export function isTranscriptionConfigured(): boolean {
  try {
    transcriptionConfig();
    return true;
  } catch {
    return false;
  }
}

/** Un mot, dans la forme que `shots.words` porte déjà. */
export type WordTiming = { text: string; start: number; duration: number };

export type Transcription = {
  /** Le texte entier, tel que le modèle l'a entendu. */
  text: string;
  words: WordTiming[];
  /** La langue détectée, quand le modèle la donne. */
  language?: string;
};

export interface Transcriber {
  transcribe(audio: Buffer, options?: { language?: string }): Promise<Transcription>;
}

/** Ce que Workers AI renvoie, dans la seule partie qui nous intéresse. */
type MotWhisper = { word?: string; start?: number; end?: number };

type ReponseWhisper = {
  result?: {
    text?: string;
    transcription_info?: { language?: string; duration?: number };
    /**
     * Les mots vivent **dans les segments**, pas à la racine.
     *
     * Vérifié contre l'API réelle le 5 septembre 2026, pas contre la
     * documentation : `result.words` n'existe pas, et le lire rendait un
     * tableau vide sans erreur — donc des sous-titres muets, silencieusement.
     *
     * Leurs bornes sont **absolues** et non relatives au segment : le premier
     * mot du segment 1 démarre à 4,24 s, exactement comme le segment. Rien à
     * décaler, juste à mettre à plat.
     */
    segments?: { start?: number; end?: number; words?: MotWhisper[] }[];
  };
  success?: boolean;
  errors?: { message?: string }[];
};

/**
 * Les fragments que Whisper rend séparés et qui n'existent pas seuls.
 *
 * Le modèle tokenise, il ne découpe pas des mots français : « qu'elle » sort
 * en `qu` puis `'elle`, et le point d'exclamation final sort tout seul. Chacun
 * devient alors un mot de sous-titre, donc un espace à l'écran — le rendu
 * affichait « qu 'elle n 'avait pas encore gagné ».
 *
 * Un fragment qui **commence** par une apostrophe se recolle au mot d'avant,
 * et une ponctuation isolée aussi. Ce n'est pas cosmétique : le karaoké
 * allume un mot à la fois, et « qu' » puis « elle » s'allumeraient
 * séparément.
 */
function seColleAuPrecedent(text: string): boolean {
  return /^['’]/.test(text) || /^[^\p{L}\p{N}]+$/u.test(text);
}

/**
 * Ce qui sépare le fragment du mot qu'il rejoint.
 *
 * Rien, dans le cas général : « qu' » + « elle », « vidéo » + « . ». Mais le
 * français met une **espace fine insécable** devant `! ? ; :` et dans les
 * guillemets français. Insécable pour qu'un retour à la ligne ne laisse pas
 * le point d'exclamation seul en début de ligne — et le sous-titre passe
 * justement à la ligne quand il est trop long.
 */
function liant(fragment: string): string {
  return /^[!?;:»]/.test(fragment) ? ' ' : '';
}

/**
 * Convertit les bornes du modèle en durées.
 *
 * Whisper rend un début et une **fin** ; la composition veut un début et une
 * **durée**. Un mot dont la fin précède le début — ça arrive sur les silences
 * mal découpés — reçoit une durée plancher plutôt que d'être jeté : un mot
 * manquant décalerait visuellement tout le reste de la phrase.
 *
 * Les fragments se recollent au passage : le mot fusionné garde le début du
 * premier et va jusqu'à la fin du dernier, donc le karaoké l'allume d'un seul
 * geste.
 */
export function toWordTimings(brut: MotWhisper[]): WordTiming[] {
  const MIN = 0.06;
  const arrondi = (n: number) => Math.round(n * 1000) / 1000;
  const sortie: WordTiming[] = [];

  for (const mot of brut) {
    const text = (mot.word ?? '').trim();
    if (!text) continue;

    const start = Math.max(0, mot.start ?? 0);
    const end = Math.max(start, mot.end ?? start);
    const precedent = sortie[sortie.length - 1];

    if (precedent && seColleAuPrecedent(text)) {
      precedent.text += liant(text) + text;
      precedent.duration = arrondi(Math.max(MIN, end - precedent.start));
      continue;
    }

    sortie.push({
      text,
      start: arrondi(start),
      duration: arrondi(Math.max(MIN, end - start)),
    });
  }

  return sortie;
}

export class WhisperTranscriber implements Transcriber {
  constructor(private readonly config: TranscriptionConfig = transcriptionConfig()) {}

  get model(): string {
    return this.config.model;
  }

  async transcribe(
    audio: Buffer,
    { language }: { language?: string } = {}
  ): Promise<Transcription> {
    if (audio.length === 0) {
      throw new TranscriptionError('There is no audio to transcribe.', 400);
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new TranscriptionError(
        `That audio weighs ${(audio.length / 1e6).toFixed(0)} MB; Workers AI ` +
          `takes ${MAX_AUDIO_BYTES / 1e6} MB at most. Extract the audio track ` +
          'rather than sending the video, and split anything longer.',
        413
      );
    }

    /*
     * Du JSON avec l'audio en base64 — **pas** du multipart.
     *
     * C'est l'inverse des images, qui exigent du multipart sur le même
     * fournisseur. Un multipart ici répond « AiError: Invalid input », message
     * qui ne dit pas du tout qu'il faut changer d'encodage. Vérifié contre
     * l'API, pas contre la documentation.
     */
    const response = await fetch(
      `${this.config.baseUrl}/accounts/${this.config.accountId}/ai/run/${this.config.model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio: audio.toString('base64'),
          task: 'transcribe',
          ...(language ? { language } : {}),
        }),
      }
    );

    const texte = await response.text();
    if (!response.ok) {
      throw new TranscriptionError(
        `Workers AI returned HTTP ${response.status}: ${texte.slice(0, 300)}`
      );
    }

    let charge: ReponseWhisper;
    try {
      charge = JSON.parse(texte) as ReponseWhisper;
    } catch {
      throw new TranscriptionError('Workers AI returned something that is not JSON.');
    }

    if (charge.success === false) {
      const raison = charge.errors?.[0]?.message ?? 'no reason given';
      throw new TranscriptionError(`Workers AI refused the audio: ${raison}`);
    }

    // Mis à plat depuis les segments : c'est là que Workers AI les range.
    const words = toWordTimings(
      (charge.result?.segments ?? []).flatMap((segment) => segment.words ?? [])
    );
    const text = (charge.result?.text ?? '').trim();

    if (!text) {
      throw new TranscriptionError(
        'Workers AI heard nothing in that audio. Check that the track is not silent.',
        422
      );
    }

    // Un texte sans bornes de mots reste utilisable : la composition retombe
    // sur un découpage régulier (`wordsOrFallback`). Mieux vaut un sous-titre
    // approximatif que pas de sous-titre.
    return {
      text,
      words,
      language: charge.result?.transcription_info?.language,
    };
  }
}

export function createTranscriber(): Transcriber {
  return new WhisperTranscriber();
}
