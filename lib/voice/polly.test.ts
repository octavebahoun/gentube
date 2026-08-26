import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SynthesizeSpeechCommandInput } from '@aws-sdk/client-polly';
import { expectedSeconds, mp3Bytes } from '@/lib/test/mp3';
import { VoiceError, VoiceNotConfiguredError } from './contract';
import {
  DEFAULT_POLLY_VOICE,
  POLLY_VOICES,
  PollyVoiceClient,
  isPollyConfigured,
  pollyConfig,
  resolvePollyVoice,
  wordsFromSpeechMarks,
  type PollyTransport,
} from './polly';

const MANAGED = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'POLLY_REGION',
  'POLLY_ENGINE',
  'POLLY_DEFAULT_VOICE',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const name of MANAGED) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of MANAGED) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function configured() {
  process.env.AWS_ACCESS_KEY_ID = 'AKIAEXAMPLE';
  process.env.AWS_SECRET_ACCESS_KEY = 'secret';
  process.env.AWS_REGION = 'eu-west-3';
}

/** Enregistre les requêtes et rend ce qu'on lui dit de rendre. */
function transport(marks: string, audio = mp3Bytes({ frames: 100 })) {
  const calls: SynthesizeSpeechCommandInput[] = [];
  const sender: PollyTransport = {
    async synthesize(input) {
      calls.push(input);
      return input.OutputFormat === 'json' ? Buffer.from(marks, 'utf8') : audio;
    },
  };
  return { calls, sender };
}

const mark = (time: number, value: string) =>
  JSON.stringify({ time, type: 'word', start: 0, end: 0, value });

describe('pollyConfig', () => {
  it('names the missing variable instead of failing on a signed request', () => {
    expect(() => pollyConfig()).toThrow(VoiceNotConfiguredError);
    expect(isPollyConfigured()).toBe(false);
  });

  it('falls back on the render region, since it is the same account', () => {
    configured();
    expect(pollyConfig().region).toBe('eu-west-3');
    process.env.POLLY_REGION = 'eu-west-1';
    expect(pollyConfig().region).toBe('eu-west-1');
  });

  it('speaks neural by default, because Starter margin assumes it', () => {
    configured();
    expect(pollyConfig().engine).toBe('neural');
  });
});

describe('resolvePollyVoice', () => {
  it('accepts a short name, whatever its case', () => {
    expect(resolvePollyVoice('lea')).toBe('Lea');
    expect(resolvePollyVoice('Remi')).toBe('Remi');
  });

  it('falls back rather than forwarding an ElevenLabs id it cannot use', () => {
    // Le champ `voice` d'un projet vient peut-être d'un plan Pro. Passer cet
    // identifiant à Polly ferait échouer la requête au lieu de parler.
    expect(resolvePollyVoice('JBFqnCBsd6RMkjVDRZzb')).toBe(
      POLLY_VOICES[DEFAULT_POLLY_VOICE]
    );
    expect(resolvePollyVoice(null)).toBe(POLLY_VOICES[DEFAULT_POLLY_VOICE]);
  });

  it('refuses a voice that only exists on the standard engine', () => {
    // Celine et Mathieu n'ont pas de variante neural : l'appel serait rejeté.
    expect(resolvePollyVoice('celine')).toBe('Lea');
    expect(resolvePollyVoice('mathieu')).toBe('Lea');
  });
});

describe('wordsFromSpeechMarks', () => {
  it('closes each word with the start of the next one', () => {
    const body = [mark(0, 'Une'), mark(500, 'idée')].join('\n');
    const words = wordsFromSpeechMarks(body, 1.2);

    expect(words[0]).toEqual({ text: 'Une', start: 0, duration: 0.5 });
  });

  it('closes the last word with the measured length of the audio', () => {
    // Un speech mark ne porte qu'un instant de départ. Sans la durée totale,
    // le dernier mot du sous-titre clignoterait au lieu de rester affiché.
    const words = wordsFromSpeechMarks(mark(200, 'seul'), 1.5);
    expect(words[0]).toEqual({ text: 'seul', start: 0.2, duration: 1.3 });
  });

  it('keeps only the word marks', () => {
    const body = [
      JSON.stringify({ time: 0, type: 'sentence', value: 'Une idée' }),
      mark(0, 'Une'),
      JSON.stringify({ time: 10, type: 'viseme', value: 'k' }),
    ].join('\n');

    expect(wordsFromSpeechMarks(body, 1).map((w) => w.text)).toEqual(['Une']);
  });

  it('survives a truncated line instead of losing the alignment', () => {
    const body = [mark(0, 'Une'), '{"time":500,"type":"wo', mark(900, 'idée')].join(
      '\n'
    );
    expect(wordsFromSpeechMarks(body, 1.4).map((w) => w.text)).toEqual([
      'Une',
      'idée',
    ]);
  });

  it('never yields a negative duration on marks out of order', () => {
    const body = [mark(900, 'deux'), mark(100, 'un')].join('\n');
    for (const word of wordsFromSpeechMarks(body, 1)) {
      expect(word.duration).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('PollyVoiceClient', () => {
  const config = { region: 'eu-west-3', engine: 'neural', defaultVoice: 'lea' };

  it('asks twice: the audio, then the speech marks', async () => {
    // Polly ne rend jamais les deux dans une réponse. C'est le prix des
    // timings mot à mot, et il vaut d'être visible dans un test.
    const { calls, sender } = transport(mark(0, 'Une'));
    await new PollyVoiceClient(config, sender).synthesize('Une idée');

    expect(calls.map((call) => call.OutputFormat)).toEqual(['mp3', 'json']);
    expect(calls[1].SpeechMarkTypes).toEqual(['word']);
    expect(calls.map((call) => call.VoiceId)).toEqual(['Lea', 'Lea']);
    expect(calls[0].Engine).toBe('neural');
  });

  it('measures the duration in the mp3, since Polly never states it', async () => {
    const audio = mp3Bytes({ frames: 100, xing: { delay: 576, padding: 1000 } });
    const { sender } = transport(mark(0, 'Une'), audio);

    const voiceover = await new PollyVoiceClient(config, sender).synthesize('Une');
    expect(voiceover.durationS).toBe(expectedSeconds(100, 1576));
    expect(voiceover.contentType).toBe('audio/mpeg');
  });

  it('refuses an empty narration before paying for silence', async () => {
    const { calls, sender } = transport('');
    await expect(
      new PollyVoiceClient(config, sender).synthesize('   ')
    ).rejects.toThrow(VoiceError);
    expect(calls).toHaveLength(0);
  });

  it('refuses audio without speech marks rather than shipping mute subtitles', async () => {
    const { sender } = transport('');
    await expect(
      new PollyVoiceClient(config, sender).synthesize('Une idée')
    ).rejects.toThrow(/speech marks/);
  });
});
