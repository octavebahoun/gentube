import { z } from 'zod';
import type { WordTiming } from '@/lib/storyboard/render';

/**
 * ElevenLabs voice-over with word-level timings.
 *
 * The endpoint used is `/with-timestamps`, which returns the audio *and* a
 * character-by-character alignment. Those characters are folded into words
 * here: that alignment is what makes karaoke subtitles possible, and it is
 * also how a scene learns its real duration.
 *
 * The duration is read off the alignment rather than by decoding the mp3, so
 * this module needs no audio dependency. It is the length of speech, excluding
 * trailing silence — which is the right number here, because the renderer adds
 * its own pause after each narration.
 */

export const VOICE_IDS: Record<string, string> = {
  george: 'JBFqnCBsd6RMkjVDRZzb',
  liam: 'EmZGlxI7QPvCEMOkFhB9',
  antoni: 'ErXwobaYiN019PkySvjV',
  anais: '5OnMHwgTFgvPVwE8jP6B',
  rachel: 'or4EV8aZq78KWcXw48wd',
};

export const DEFAULT_VOICE = 'george';
const DEFAULT_BASE_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'eleven_multilingual_v2';

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

export type VoiceConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  defaultVoice: string;
};

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function voiceConfig(): VoiceConfig {
  const apiKey = read('ELEVENLABS_API_KEY');
  if (!apiKey) throw new VoiceNotConfiguredError('ELEVENLABS_API_KEY');

  return {
    apiKey,
    baseUrl: (read('ELEVENLABS_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: read('ELEVENLABS_MODEL') ?? DEFAULT_MODEL,
    defaultVoice: read('ELEVENLABS_DEFAULT_VOICE_ID') ?? DEFAULT_VOICE,
  };
}

export function isVoiceConfigured(): boolean {
  try {
    voiceConfig();
    return true;
  } catch {
    return false;
  }
}

/** Accepts a short name from the map, or a raw ElevenLabs voice id. */
export function resolveVoiceId(voice?: string | null): string {
  const wanted = voice?.trim().toLowerCase();
  if (wanted && VOICE_IDS[wanted]) return VOICE_IDS[wanted];
  if (voice && /^[a-zA-Z0-9]{15,25}$/.test(voice.trim())) return voice.trim();
  return VOICE_IDS[DEFAULT_VOICE];
}

const alignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});

const withTimestampsSchema = z.object({
  audio_base64: z.string().min(1),
  alignment: alignmentSchema.nullable().optional(),
  normalized_alignment: alignmentSchema.nullable().optional(),
});

const round = (value: number) => Number(value.toFixed(3));

/**
 * Folds a character alignment into word timings. Whitespace closes a word;
 * punctuation stays attached to it, the way it is pronounced.
 */
export function wordsFromAlignment(
  alignment: z.infer<typeof alignmentSchema> | null | undefined
): WordTiming[] {
  const words: WordTiming[] = [];
  if (!alignment?.characters?.length) return words;

  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } =
    alignment;

  let current: string[] = [];
  let start: number | null = null;
  let end = 0;

  const flush = () => {
    if (current.length > 0 && start !== null) {
      words.push({
        text: current.join(''),
        start: round(start),
        duration: round(Math.max(0, end - start)),
      });
    }
    current = [];
    start = null;
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (/\s/.test(character)) {
      flush();
      continue;
    }
    if (start === null) start = starts[index] ?? end;
    current.push(character);
    end = ends[index] ?? end;
  }
  flush();

  return words;
}

export type Voiceover = {
  audio: Buffer;
  contentType: string;
  words: WordTiming[];
  /** Length of speech in seconds, from the alignment. */
  durationS: number;
};

export interface VoiceSynthesizer {
  synthesize(text: string, voice?: string | null): Promise<Voiceover>;
}

export class ElevenLabsClient implements VoiceSynthesizer {
  constructor(private readonly config: VoiceConfig = voiceConfig()) {}

  async synthesize(text: string, voice?: string | null): Promise<Voiceover> {
    const spoken = text.trim();
    if (!spoken) throw new VoiceError('Nothing to read: the narration is empty.', 400);

    const voiceId = resolveVoiceId(voice ?? this.config.defaultVoice);
    const response = await fetch(
      `${this.config.baseUrl}/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ text: spoken, model_id: this.config.model }),
      }
    );

    const body = await response.text();

    if (!response.ok) {
      let detail = body.slice(0, 300);
      try {
        const parsed = JSON.parse(body);
        detail = parsed?.detail?.message ?? parsed?.detail ?? detail;
      } catch {
        // Keep the excerpt — never echo the request, which carries the key.
      }
      throw new VoiceError(
        `ElevenLabs returned HTTP ${response.status}: ${
          typeof detail === 'string' ? detail : JSON.stringify(detail)
        }`,
        response.status === 429 ? 429 : 502
      );
    }

    let payload: z.infer<typeof withTimestampsSchema>;
    try {
      payload = withTimestampsSchema.parse(JSON.parse(body));
    } catch {
      throw new VoiceError('ElevenLabs returned an answer we cannot read.');
    }

    // `normalized_alignment` follows the text as pronounced; the raw one
    // follows the characters we sent. Either yields the same timing spine.
    const words = wordsFromAlignment(payload.alignment ?? payload.normalized_alignment);
    if (words.length === 0) {
      throw new VoiceError(
        'ElevenLabs returned audio without an alignment, so the scene has no ' +
          'measurable duration.'
      );
    }

    const last = words[words.length - 1];
    return {
      audio: Buffer.from(payload.audio_base64, 'base64'),
      contentType: 'audio/mpeg',
      words,
      durationS: round(last.start + last.duration),
    };
  }
}

export function createVoiceClient(): ElevenLabsClient {
  return new ElevenLabsClient(voiceConfig());
}
