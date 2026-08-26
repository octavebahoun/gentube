import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expectedSeconds, mp3Bytes } from '@/lib/test/mp3';
import { VoiceError, VoiceNotConfiguredError } from './contract';
import { POLLY_VOICES } from './polly';
import {
  DEFAULT_EDGE_VOICE,
  EDGE_VOICES,
  EdgeVoiceClient,
  edgeConfig,
  isEdgeConfigured,
  resolveEdgeVoice,
  wordsFromBoundaries,
  type EdgeTransport,
} from './edge';

const MANAGED = ['EDGE_TTS_DISABLED', 'EDGE_TTS_VOICE', 'EDGE_TTS_TIMEOUT_MS'] as const;

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

/** Un mot d'Edge : offsets en centaines de nanosecondes. */
const boundary = (text: string, startS: number, durationS: number) =>
  JSON.stringify({
    Metadata: [
      {
        Type: 'WordBoundary',
        Data: {
          Offset: startS * 10_000_000,
          Duration: durationS * 10_000_000,
          text: { Text: text, Length: text.length },
        },
      },
    ],
  });

function transport(metadata: string[], audio = mp3Bytes({ frames: 300 })) {
  const calls: { voiceName: string; text: string }[] = [];
  const sender: EdgeTransport = {
    async speak(voiceName, text) {
      calls.push({ voiceName, text });
      return { audio, metadata };
    },
  };
  return { calls, sender };
}

describe('edgeConfig', () => {
  it('can be switched off, so a test never reaches Microsoft', () => {
    process.env.EDGE_TTS_DISABLED = '1';
    expect(() => edgeConfig()).toThrow(VoiceNotConfiguredError);
    expect(isEdgeConfigured()).toBe(false);
  });

  it('needs no key at all — that is the whole point', () => {
    expect(isEdgeConfigured()).toBe(true);
    expect(edgeConfig().defaultVoice).toBe(DEFAULT_EDGE_VOICE);
  });

  it('ignores a timeout that is not a number', () => {
    process.env.EDGE_TTS_TIMEOUT_MS = 'bientôt';
    expect(edgeConfig().timeoutMs).toBeGreaterThan(0);
  });
});

describe('resolveEdgeVoice', () => {
  it('shares its short names with Polly, so the two passes sound alike', () => {
    // Le client entendrait sinon une femme dans son aperçu et un homme dans sa
    // vidéo : les deux passes lisent le même champ `voiceId` de projet.
    expect(Object.keys(EDGE_VOICES).sort()).toEqual(
      Object.keys(POLLY_VOICES).sort()
    );
  });

  it('accepts a raw Edge voice name', () => {
    expect(resolveEdgeVoice('fr-FR-EloiseNeural')).toBe('fr-FR-EloiseNeural');
  });

  it('falls back rather than forwarding a name from another provider', () => {
    expect(resolveEdgeVoice('JBFqnCBsd6RMkjVDRZzb')).toBe(
      EDGE_VOICES[DEFAULT_EDGE_VOICE]
    );
  });
});

describe('wordsFromBoundaries', () => {
  it('converts ticks into seconds', () => {
    const words = wordsFromBoundaries([boundary('Une', 0.1, 0.163)]);
    expect(words).toEqual([{ text: 'Une', start: 0.1, duration: 0.163 }]);
  });

  it('keeps only the word boundaries', () => {
    const other = JSON.stringify({
      Metadata: [{ Type: 'SessionEnd', Data: {} }],
    });
    expect(wordsFromBoundaries([other, boundary('Une', 0, 0.2)])).toHaveLength(1);
  });

  it('survives a message it cannot read', () => {
    const words = wordsFromBoundaries(['{"Metadata":[{"Ty', boundary('Une', 0, 0.2)]);
    expect(words.map((w) => w.text)).toEqual(['Une']);
  });
});

describe('EdgeVoiceClient', () => {
  const config = { defaultVoice: 'lea', timeoutMs: 5_000 };

  it('bills the speech, not the file', async () => {
    // Mesuré sur un vrai appel : 6,12 s de fichier pour 5,24 s de parole. Sur
    // le prix, la différence est de 17 %, et elle serait contre le client.
    const { sender } = transport([
      boundary('Une', 0.1, 0.2),
      boundary('idée', 0.4, 0.3),
    ]);

    const voiceover = await new EdgeVoiceClient(config, sender).synthesize('Une idée');
    expect(voiceover.durationS).toBe(0.7);
    expect(voiceover.words).toHaveLength(2);
  });

  it('falls back on the file length when no boundary came back', async () => {
    // Large, mais jamais faux : mieux vaut surestimer une durée que renvoyer
    // zéro et offrir la scène.
    const { sender } = transport([], mp3Bytes({ frames: 300 }));
    const voiceover = await new EdgeVoiceClient(config, sender).synthesize('Une');
    expect(voiceover.durationS).toBe(expectedSeconds(300));
  });

  it('resolves the voice before speaking', async () => {
    const { calls, sender } = transport([boundary('Une', 0, 0.2)]);
    await new EdgeVoiceClient(config, sender).synthesize('Une', 'remi');
    expect(calls[0].voiceName).toBe(EDGE_VOICES.remi);
  });

  it('refuses an empty narration without opening a connection', async () => {
    const { calls, sender } = transport([]);
    await expect(
      new EdgeVoiceClient(config, sender).synthesize('  ')
    ).rejects.toThrow(VoiceError);
    expect(calls).toHaveLength(0);
  });

  it('refuses a silent answer instead of billing a scene at zero', async () => {
    const { sender } = transport([], Buffer.alloc(0));
    await expect(
      new EdgeVoiceClient(config, sender).synthesize('Une idée')
    ).rejects.toThrow(/without any audio/);
  });
});
