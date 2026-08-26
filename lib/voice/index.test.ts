import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VoiceNotConfiguredError } from './contract';
import { ElevenLabsClient } from './elevenlabs';
import { PollyVoiceClient } from './polly';
import { EdgeVoiceClient } from './edge';
import {
  createDeliveryVoiceClient,
  createMeasuringVoiceClient,
  deliveryProviderFor,
  voiceProviderFor,
} from './index';

const MANAGED = [
  'VOICE_PROVIDER',
  'EDGE_TTS_DISABLED',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'ELEVENLABS_API_KEY',
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

const withPolly = () => {
  process.env.AWS_ACCESS_KEY_ID = 'AKIAEXAMPLE';
  process.env.AWS_SECRET_ACCESS_KEY = 'secret';
  process.env.AWS_REGION = 'eu-west-3';
};
const withElevenLabs = () => {
  process.env.ELEVENLABS_API_KEY = 'xi-example';
};

describe('voiceProviderFor', () => {
  it('gives Starter the voice its margin assumes', () => {
    // docs/tarifs.md : 41 % de marge sur Starter, Polly Neural inclus dedans.
    expect(voiceProviderFor('starter')).toBe('polly');
  });

  it('reserves the premium voice for the plans that pay for it', () => {
    expect(voiceProviderFor('pro')).toBe('elevenlabs');
    expect(voiceProviderFor('business')).toBe('elevenlabs');
  });

  it('defaults to the cheap voice when the plan is unknown', () => {
    // Un tenant sans plan lisible ne doit pas hériter de la voix premium.
    expect(voiceProviderFor(null)).toBe('polly');
    expect(voiceProviderFor(undefined)).toBe('polly');
  });
});

describe('createVoiceClient', () => {
  it('builds Polly for Starter and ElevenLabs above', () => {
    withPolly();
    withElevenLabs();

    expect(createDeliveryVoiceClient('starter')).toBeInstanceOf(PollyVoiceClient);
    expect(createDeliveryVoiceClient('pro')).toBeInstanceOf(ElevenLabsClient);
  });

  it('throws instead of quietly serving the other provider', () => {
    // Une bascule silencieuse ferait payer la voix premium sur un plan Starter
    // — ou servirait la voix d'entrée de gamme à qui a payé l'autre.
    withElevenLabs();
    expect(() => createDeliveryVoiceClient('starter')).toThrow(VoiceNotConfiguredError);

    delete process.env.ELEVENLABS_API_KEY;
    withPolly();
    expect(() => createDeliveryVoiceClient('pro')).toThrow(VoiceNotConfiguredError);
  });

  it('lets VOICE_PROVIDER override the plan, for a half-configured machine', () => {
    withElevenLabs();
    process.env.VOICE_PROVIDER = 'elevenlabs';
    expect(createDeliveryVoiceClient('starter')).toBeInstanceOf(ElevenLabsClient);
  });

  it('ignores a VOICE_PROVIDER that names no provider', () => {
    withPolly();
    process.env.VOICE_PROVIDER = 'suno';
    expect(createDeliveryVoiceClient('starter')).toBeInstanceOf(PollyVoiceClient);
  });
});
