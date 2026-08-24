import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ElevenLabsClient,
  VoiceError,
  VoiceNotConfiguredError,
  isVoiceConfigured,
  resolveVoiceId,
  voiceConfig,
  wordsFromAlignment,
  VOICE_IDS,
} from './elevenlabs';

const MANAGED = [
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_BASE_URL',
  'ELEVENLABS_MODEL',
  'ELEVENLABS_DEFAULT_VOICE_ID',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of MANAGED) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MANAGED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

function client() {
  return new ElevenLabsClient({
    apiKey: 'xi-test-key',
    baseUrl: 'https://api.elevenlabs.test/v1',
    model: 'eleven_multilingual_v2',
    defaultVoice: 'george',
  });
}

/** Character-level alignment, as the API returns it. */
function alignmentOf(text: string, secondsPerChar = 0.1) {
  return {
    characters: [...text],
    character_start_times_seconds: [...text].map((_, index) => index * secondsPerChar),
    character_end_times_seconds: [...text].map((_, index) => (index + 1) * secondsPerChar),
  };
}

function stubFetch(payload: unknown, { status = 200, raw }: { status?: number; raw?: string } = {}) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(raw ?? JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('folding an alignment into words', () => {
  it('closes a word on whitespace and keeps its punctuation', () => {
    const words = wordsFromAlignment(alignmentOf('Salut le monde !'));

    expect(words.map((word) => word.text)).toEqual(['Salut', 'le', 'monde', '!']);
    expect(words[0]).toEqual({ text: 'Salut', start: 0, duration: 0.5 });
    // 'le' starts after the space that follows 'Salut'.
    expect(words[1].start).toBeCloseTo(0.6, 3);
  });

  it('returns nothing when there is no alignment to fold', () => {
    expect(wordsFromAlignment(null)).toEqual([]);
    expect(wordsFromAlignment(undefined)).toEqual([]);
    expect(
      wordsFromAlignment({
        characters: [],
        character_start_times_seconds: [],
        character_end_times_seconds: [],
      })
    ).toEqual([]);
  });
});

describe('voice resolution', () => {
  it('maps a short name to its provider id', () => {
    expect(resolveVoiceId('liam')).toBe(VOICE_IDS.liam);
    expect(resolveVoiceId('LIAM')).toBe(VOICE_IDS.liam);
  });

  it('passes a raw provider id through', () => {
    expect(resolveVoiceId('JBFqnCBsd6RMkjVDRZzb')).toBe('JBFqnCBsd6RMkjVDRZzb');
  });

  it('falls back to the default rather than failing a render', () => {
    expect(resolveVoiceId('fr-FR-HenriNeural')).toBe(VOICE_IDS.george);
    expect(resolveVoiceId(null)).toBe(VOICE_IDS.george);
    expect(resolveVoiceId('')).toBe(VOICE_IDS.george);
  });
});

describe('voiceConfig', () => {
  it('refuses to run without a key', () => {
    expect(isVoiceConfigured()).toBe(false);
    expect(() => voiceConfig()).toThrow(VoiceNotConfiguredError);
  });

  it('defaults the endpoint, model and voice', () => {
    process.env.ELEVENLABS_API_KEY = 'xi-abc';
    expect(voiceConfig()).toEqual({
      apiKey: 'xi-abc',
      baseUrl: 'https://api.elevenlabs.io/v1',
      model: 'eleven_multilingual_v2',
      defaultVoice: 'george',
    });
  });
});

describe('synthesising a scene', () => {
  it('asks for timestamps and measures the speech', async () => {
    const fetchMock = stubFetch({
      audio_base64: Buffer.from('mp3-bytes').toString('base64'),
      alignment: alignmentOf('Salut monde'),
    });

    const result = await client().synthesize('  Salut monde  ', 'liam');

    expect(result.audio.toString()).toBe('mp3-bytes');
    expect(result.contentType).toBe('audio/mpeg');
    expect(result.words.map((word) => word.text)).toEqual(['Salut', 'monde']);
    // 11 characters at 0.1s each: the duration is measured, not guessed.
    expect(result.durationS).toBeCloseTo(1.1, 3);

    const [url, init] = fetchMock.mock.calls[0];
    if (!init) throw new Error('fetch called without options');
    expect(url).toBe(
      `https://api.elevenlabs.test/v1/text-to-speech/${VOICE_IDS.liam}/with-timestamps`
    );
    expect(init.headers).toMatchObject({ 'xi-api-key': 'xi-test-key' });
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'Salut monde',
      model_id: 'eleven_multilingual_v2',
    });
  });

  it('refuses an empty line before spending anything', async () => {
    const fetchMock = stubFetch({});
    await expect(client().synthesize('   ')).rejects.toThrow(VoiceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats audio without an alignment as unusable', async () => {
    // No alignment means no measurable duration, so nothing can be priced.
    stubFetch({ audio_base64: Buffer.from('x').toString('base64'), alignment: null });
    await expect(client().synthesize('Salut')).rejects.toThrow(/no measurable duration|cannot read/);
  });

  it('surfaces the provider error and keeps 429 distinct', async () => {
    stubFetch({ detail: { message: 'quota_exceeded' } }, { status: 429 });

    try {
      await client().synthesize('Salut');
      throw new Error('expected a VoiceError');
    } catch (error) {
      expect(error).toBeInstanceOf(VoiceError);
      expect((error as VoiceError).statusCode).toBe(429);
      expect((error as Error).message).toContain('quota_exceeded');
    }
  });

  it('never puts the api key in an error message', async () => {
    stubFetch(null, { status: 500, raw: '<html>boom</html>' });

    await expect(client().synthesize('Salut')).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('xi-test-key'),
      })
    );
  });
});
