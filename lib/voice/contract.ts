import type { WordTiming } from '@/lib/storyboard/render';

/**
 * Ce que l'étape voix off attend d'un fournisseur, et rien de plus.
 *
 * Le contrat vit à part des implémentations parce qu'il y en a deux, et que
 * `docs/tarifs.md` en fait un argument de vente : Polly Neural sur Starter,
 * ElevenLabs réservé à Pro et Business. Un plan qui monte s'entend.
 *
 * Les trois champs comptent pour des raisons différentes. `audio` part sur R2,
 * `words` fait les sous-titres karaoké, et `durationS` **fixe le prix** — une
 * scène coûte sa durée. C'est pour ça qu'aucune implémentation n'a le droit de
 * l'estimer.
 */

export type Voiceover = {
  audio: Buffer;
  contentType: string;
  words: WordTiming[];
  /** Secondes. Mesuré, jamais deviné : c'est ce que le client paie. */
  durationS: number;
};

export interface VoiceSynthesizer {
  synthesize(
    text: string,
    voice?: string | null,
    options?: VoiceOptions
  ): Promise<Voiceover>;
}

/**
 * Comment la phrase doit être dite, en plus de qui la dit.
 *
 * `style` est l'intention de diction du registre, traduite en nombre de 0 à
 * 1 — posée vers 0, habitée vers 1. Ne la lit qu'ElevenLabs
 * (`voice_settings.style`) : Edge et Polly ne l'écoutent pas.
 */
export type VoiceOptions = {
  style?: number;
};

export class VoiceNotConfiguredError extends Error {
  readonly statusCode = 503;

  constructor(missing: string) {
    super(`Voice-over is not configured: ${missing} is missing.`);
    this.name = 'VoiceNotConfiguredError';
  }
}

export class VoiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'VoiceError';
    this.statusCode = statusCode;
  }
}

/** Trois décimales : la milliseconde suffit, et le JSON reste lisible. */
export const round = (value: number) => Number(value.toFixed(3));

export function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}
