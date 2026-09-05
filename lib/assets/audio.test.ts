import { describe, expect, it } from 'vitest';
import { TAUX_ASR, extraireLaBandeSon, toWav } from './audio';

/** Relit un WAV comme le ferait le décodeur d'en face. */
function relire(wav: Uint8Array) {
  const vue = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const texte = (offset: number, taille: number) =>
    String.fromCharCode(
      ...Array.from({ length: taille }, (_, i) => vue.getUint8(offset + i))
    );

  return {
    riff: texte(0, 4),
    wave: texte(8, 4),
    canaux: vue.getUint16(22, true),
    sampleRate: vue.getUint32(24, true),
    bits: vue.getUint16(34, true),
    tailleData: vue.getUint32(40, true),
    echantillon: (i: number) => vue.getInt16(44 + i * 2, true),
  };
}

describe('toWav', () => {
  it('écrit un en-tête que tout décodeur lit sans négocier', () => {
    const wav = toWav(new Float32Array([0, 0, 0, 0]), TAUX_ASR);
    const lu = relire(wav);

    expect(lu.riff).toBe('RIFF');
    expect(lu.wave).toBe('WAVE');
    // Mono 16 bits : ce que la reconnaissance vocale utilise de toute façon.
    expect(lu.canaux).toBe(1);
    expect(lu.bits).toBe(16);
    expect(lu.sampleRate).toBe(TAUX_ASR);
    expect(wav.byteLength).toBe(44 + 4 * 2);
    expect(lu.tailleData).toBe(8);
  });

  it('borne les échantillons au lieu de les laisser déborder', () => {
    // Un rééchantillonnage peut sortir de [-1, 1] : sans borne, le
    // dépassement repasse de l'autre côté et l'échantillon claque.
    const lu = relire(toWav(new Float32Array([1.5, -1.5, 1, -1]), TAUX_ASR));

    expect(lu.echantillon(0)).toBe(32767);
    expect(lu.echantillon(1)).toBe(-32768);
    expect(lu.echantillon(2)).toBe(32767);
    expect(lu.echantillon(3)).toBe(-32768);
  });

  it('garde le silence au silence', () => {
    const lu = relire(toWav(new Float32Array([0, 0.5, -0.5]), TAUX_ASR));

    expect(lu.echantillon(0)).toBe(0);
    expect(lu.echantillon(1)).toBeGreaterThan(16_000);
    expect(lu.echantillon(2)).toBeLessThan(-16_000);
  });
});

describe('extraireLaBandeSon', () => {
  const fichier = () => new Blob([new Uint8Array([1, 2, 3, 4])]);

  const fabrique = (options: {
    duration?: number;
    sampleRate?: number;
    refuse16k?: boolean;
    decodeJette?: boolean;
  }) => {
    const source = {
      duration: options.duration ?? 2,
      sampleRate: options.sampleRate ?? 48_000,
    } as AudioBuffer;

    return {
      async decode() {
        if (options.decodeJette) throw new Error('unsupported container');
        return source;
      },
      async resample(_source: AudioBuffer, taux: number) {
        if (options.refuse16k && taux === TAUX_ASR) {
          throw new Error('sample rate too low');
        }
        return new Float32Array(Math.ceil(source.duration * taux));
      },
    };
  };

  it('rend du mono 16 kHz, le format que Whisper veut', async () => {
    const sortie = await extraireLaBandeSon(fichier(), fabrique({ duration: 3 }));

    expect(sortie?.sampleRate).toBe(TAUX_ASR);
    expect(sortie?.durationS).toBe(3);
    // 32 Ko la seconde : trois secondes tiennent largement sous les 25 Mo.
    expect(sortie?.bytes.byteLength).toBe(44 + 3 * TAUX_ASR * 2);
  });

  it('retombe sur le taux natif quand le navigateur refuse 16 kHz', async () => {
    // Safari a longtemps refusé un OfflineAudioContext en dessous de 44,1 kHz.
    const sortie = await extraireLaBandeSon(
      fichier(),
      fabrique({ refuse16k: true, sampleRate: 44_100 })
    );

    expect(sortie?.sampleRate).toBe(44_100);
  });

  it('rend null plutôt que de faire échouer le dépôt', async () => {
    // Un conteneur indécodable ne doit pas perdre un envoi de cent
    // mégaoctets : la vidéo se monte, simplement sans sous-titres au mot.
    expect(
      await extraireLaBandeSon(fichier(), fabrique({ decodeJette: true }))
    ).toBeNull();
  });

  it('rend null sur une piste vide', async () => {
    expect(
      await extraireLaBandeSon(fichier(), fabrique({ duration: 0 }))
    ).toBeNull();
  });
});
