/**
 * Fabrique des octets mp3 à la demande, pour tester le lecteur de durée sans
 * embarquer de fichier binaire dans le dépôt.
 *
 * Un mp3 n'est qu'une suite de trames dont l'en-tête de quatre octets dit tout.
 * Le contenu audio n'est jamais décodé par ce que nous testons — des trames de
 * zéros suffisent, et une durée attendue devient une multiplication plutôt
 * qu'une valeur mystérieuse copiée d'un ffprobe.
 */

export const MPEG1_SAMPLES_PER_FRAME = 1152;
export const MPEG1_SAMPLE_RATE = 44100;
/** 144 × 128000 / 44100, tronqué : la taille d'une trame 128 kbit/s. */
export const MPEG1_FRAME_BYTES = 417;

type Options = {
  /** Nombre de trames audio, hors trame d'en-tête Xing. */
  frames: number;
  /** Ajoute une trame Xing/LAME en tête, avec son retard et son remplissage. */
  xing?: { delay: number; padding: number };
  /** Octets à insérer avant la première trame (tag ID3, bruit…). */
  prefix?: Buffer;
};

function header(): Buffer {
  // Sync 11 bits, MPEG 1, Layer III, pas de CRC, 128 kbit/s, 44,1 kHz, stéréo.
  return Buffer.from([0xff, 0xfb, 0x90, 0x00]);
}

function frame(): Buffer {
  const bytes = Buffer.alloc(MPEG1_FRAME_BYTES);
  header().copy(bytes);
  return bytes;
}

/** La trame de tête d'un fichier LAME : signature Xing, retard, remplissage. */
function xingFrame(delay: number, padding: number): Buffer {
  const bytes = frame();
  // 4 octets d'en-tête + 32 d'information latérale en stéréo.
  bytes.write('Xing', 36, 'latin1');
  // L'extension LAME commence 120 octets après la signature ; le couple
  // retard/remplissage y occupe trois octets, douze bits chacun.
  const at = 36 + 120 + 21;
  bytes[at] = delay >> 4;
  bytes[at + 1] = ((delay & 0x0f) << 4) | (padding >> 8);
  bytes[at + 2] = padding & 0xff;
  return bytes;
}

export function mp3Bytes({ frames, xing, prefix }: Options): Buffer {
  const parts: Buffer[] = [];
  if (prefix) parts.push(prefix);
  if (xing) parts.push(xingFrame(xing.delay, xing.padding));
  for (let index = 0; index < frames; index += 1) parts.push(frame());
  return Buffer.concat(parts);
}

/** Un tag ID3v2 de la taille demandée, dont la longueur est « syncsafe ». */
export function id3Tag(payloadBytes: number): Buffer {
  const tag = Buffer.alloc(10 + payloadBytes);
  tag.write('ID3', 0, 'latin1');
  tag[3] = 3; // version
  tag[6] = (payloadBytes >> 21) & 0x7f;
  tag[7] = (payloadBytes >> 14) & 0x7f;
  tag[8] = (payloadBytes >> 7) & 0x7f;
  tag[9] = payloadBytes & 0x7f;
  return tag;
}

/** Durée attendue de `frames` trames MPEG 1, en secondes. */
export function expectedSeconds(frames: number, gapSamples = 0): number {
  const samples = frames * MPEG1_SAMPLES_PER_FRAME - gapSamples;
  return Number((samples / MPEG1_SAMPLE_RATE).toFixed(3));
}
