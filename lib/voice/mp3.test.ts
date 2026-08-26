import { describe, expect, it } from 'vitest';
import {
  MPEG1_FRAME_BYTES,
  expectedSeconds,
  id3Tag,
  mp3Bytes,
} from '@/lib/test/mp3';
import { Mp3ReadError, mp3DurationSeconds } from './mp3';

describe('mp3DurationSeconds', () => {
  it('adds up the frames rather than trusting an average bitrate', () => {
    expect(mp3DurationSeconds(mp3Bytes({ frames: 100 }))).toBe(
      expectedSeconds(100)
    );
  });

  it('skips an ID3v2 tag, whose size is written seven bits at a time', () => {
    // Un tag de 200 octets : lu comme un entier normal, sa taille serait
    // fausse et la première trame introuvable.
    const bytes = mp3Bytes({ frames: 10, prefix: id3Tag(200) });
    expect(mp3DurationSeconds(bytes)).toBe(expectedSeconds(10));
  });

  it('ignores the Xing frame, which is read and never heard', () => {
    // Sans cette règle la durée dépasse d'exactement une trame — 26 ms, soit
    // 0,026 crédit facturé pour du silence de service.
    const plain = mp3DurationSeconds(mp3Bytes({ frames: 10 }));
    const tagged = mp3DurationSeconds(
      mp3Bytes({ frames: 10, xing: { delay: 0, padding: 0 } })
    );
    expect(tagged).toBe(plain);
  });

  it('subtracts the encoder delay and padding that LAME declares', () => {
    // La direction de l'erreur est ce qui compte : sans ça on surfacture.
    const bytes = mp3Bytes({ frames: 10, xing: { delay: 576, padding: 1000 } });
    expect(mp3DurationSeconds(bytes)).toBe(expectedSeconds(10, 1576));
  });

  it('ignores an absurd delay instead of applying it', () => {
    // Un décalage d'offset lirait de l'audio au lieu du tag. Une correction
    // délirante doit être écartée, pas soustraite.
    const bytes = mp3Bytes({ frames: 10, xing: { delay: 4095, padding: 4095 } });
    expect(mp3DurationSeconds(bytes)).toBe(expectedSeconds(10));
  });

  it('resynchronises past bytes that are not a frame', () => {
    const noise = Buffer.from([0xff, 0x00, 0x12, 0x34, 0xff, 0xff]);
    const bytes = mp3Bytes({ frames: 5, prefix: noise });
    expect(mp3DurationSeconds(bytes)).toBe(expectedSeconds(5));
  });

  it('refuses to invent a duration when there is no frame at all', () => {
    // Une scène sans durée mesurable ne doit pas être facturée zéro.
    expect(() => mp3DurationSeconds(Buffer.alloc(4096))).toThrow(Mp3ReadError);
  });

  it('does not mistake a truncated last frame for a whole one', () => {
    const whole = mp3Bytes({ frames: 4 });
    const cut = whole.subarray(0, whole.length - MPEG1_FRAME_BYTES + 10);
    // La trame coupée garde un en-tête valide, donc elle compte : le décodeur
    // la jouerait aussi. Ce qui importe est qu'elle ne compte qu'une fois.
    expect(mp3DurationSeconds(cut)).toBe(expectedSeconds(4));
  });
});
