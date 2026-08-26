/**
 * Durée d'un mp3, lue dans ses en-têtes de trames.
 *
 * **Pourquoi ce code existe.** Polly ne dit pas combien de temps dure ce qu'il
 * vient de synthétiser, et ses *speech marks* ne donnent que l'**instant de
 * départ** de chaque mot — jamais la fin du dernier. Or la durée d'une scène
 * est son prix (`docs/tarifs.md` : 1 crédit/s en 480p). Une durée estimée
 * serait une facture estimée.
 *
 * Un mp3 est une suite de trames, chacune précédée d'un en-tête de 4 octets qui
 * dit son débit et sa fréquence d'échantillonnage. Le nombre d'échantillons par
 * trame est fixe. On additionne donc, trame par trame, sans décoder un seul
 * octet d'audio et sans dépendance : ffmpeg n'est pas installé sur un serveur
 * serverless, et embarquer un décodeur pour lire quatre octets serait absurde.
 */

/** Fréquences d'échantillonnage, indexées par version MPEG puis par index. */
const SAMPLE_RATES: Record<number, number[]> = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  // MPEG 2.5 n'est pas dans la norme mais tous les encodeurs le produisent.
  25: [11025, 12000, 8000],
};

/** Débits du Layer III, en kbit/s. MPEG 2.5 partage la table de MPEG 2. */
const BITRATES: Record<number, number[]> = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

const LAYER_III = 0b01;

type Frame = {
  seconds: number;
  bytes: number;
  sampleRate: number;
  /** Taille de l'information latérale, qui précède un éventuel en-tête Xing. */
  sideInfoBytes: number;
};

/**
 * Décode un en-tête de trame, ou renvoie `null` si ces quatre octets n'en sont
 * pas un. Le `null` est la boucle de resynchronisation : un octet de tag ou de
 * remplissage ressemble parfois à un début de trame.
 */
function frameAt(buffer: Buffer, offset: number): Frame | null {
  if (offset + 4 > buffer.length) return null;

  const [b0, b1, b2, b3] = [
    buffer[offset],
    buffer[offset + 1],
    buffer[offset + 2],
    buffer[offset + 3],
  ];

  // Mot de synchronisation : onze bits à 1.
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const versionBits = (b1 >> 3) & 0b11;
  if (versionBits === 0b01) return null; // réservé
  const version = versionBits === 0b11 ? 1 : versionBits === 0b10 ? 2 : 25;

  // On ne gère que le Layer III : c'est ce que produisent Polly et ElevenLabs,
  // et prétendre gérer le reste sans jamais l'avoir vu serait un mensonge.
  if (((b1 >> 1) & 0b11) !== LAYER_III) return null;

  const bitrateIndex = (b2 >> 4) & 0b1111;
  if (bitrateIndex === 0 || bitrateIndex === 0b1111) return null;

  const sampleRateIndex = (b2 >> 2) & 0b11;
  if (sampleRateIndex === 0b11) return null; // réservé

  const padding = (b2 >> 1) & 1;
  const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
  const bitrate = BITRATES[version === 1 ? 1 : 2][bitrateIndex] * 1000;

  // MPEG 1 code 1152 échantillons par trame, MPEG 2 et 2.5 en codent 576.
  const samplesPerFrame = version === 1 ? 1152 : 576;
  const bytes =
    Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;
  if (bytes <= 4) return null;

  // Le mode monophonique réduit l'information latérale de moitié. C'est elle
  // qu'il faut sauter pour tomber sur l'en-tête Xing, s'il y en a un.
  const mono = ((b3 >> 6) & 0b11) === 0b11;
  const sideInfoBytes = version === 1 ? (mono ? 17 : 32) : mono ? 9 : 17;

  return {
    seconds: samplesPerFrame / sampleRate,
    bytes,
    sampleRate,
    sideInfoBytes,
  };
}

/**
 * Retard et remplissage d'encodage, en échantillons, si l'encodeur les a
 * inscrits.
 *
 * Tout encodeur mp3 ajoute du silence au début et à la fin — c'est mécanique,
 * une trame ne se coupe pas en deux. LAME (et ffmpeg derrière lui) écrit
 * combien, dans une extension de l'en-tête Xing. Sans cette correction, la
 * somme des trames dépasse la vraie durée d'environ 70 ms, ce qui **surfacture
 * le client** de 0,07 crédit par scène. La direction de l'erreur est ce qui
 * décide : arrondir contre soi, jamais contre le client.
 *
 * Les valeurs sont bornées : un décalage d'offset mal choisi lirait de l'audio
 * au lieu du tag, et une correction absurde est alors ignorée plutôt
 * qu'appliquée.
 *
 * Renvoie `null` quand il n'y a pas de tag du tout — ce qui n'est pas la même
 * chose qu'un retard nul : la première trame ne porte alors pas d'en-tête et
 * compte comme de l'audio.
 */
function encoderGapSamples(
  buffer: Buffer,
  frameOffset: number,
  sideInfoBytes: number
): number | null {
  const xing = frameOffset + 4 + sideInfoBytes;
  const magic = buffer.toString('latin1', xing, xing + 4);
  if (magic !== 'Xing' && magic !== 'Info') return null;

  // L'extension LAME commence 120 octets après la signature ; le couple
  // retard/remplissage y occupe trois octets, douze bits chacun.
  const at = xing + 120 + 21;
  if (at + 3 > buffer.length) return 0;

  const delay = (buffer[at] << 4) | (buffer[at + 1] >> 4);
  const padding = ((buffer[at + 1] & 0x0f) << 8) | buffer[at + 2];

  // Le retard d'encodage de LAME vaut 576 échantillons, plus une granule de
  // 1152 : jamais loin de 1 728. Le remplissage ne dépasse pas la trame qu'il
  // complète, soit 1 152. Au-delà, ce ne sont pas des mesures, c'est de l'audio
  // lu par erreur — on l'ignore plutôt que de fausser la facture.
  const LIMIT = 3000;
  if (delay > LIMIT || padding > LIMIT) return 0;

  return delay + padding;
}

/**
 * Position de la première trame : après un éventuel tag ID3v2, dont la taille
 * est écrite sur quatre octets « syncsafe » (sept bits utiles chacun, pour ne
 * jamais imiter un mot de synchronisation).
 */
function firstFrameOffset(buffer: Buffer): number {
  if (buffer.length < 10 || buffer.toString('latin1', 0, 3) !== 'ID3') return 0;

  const size =
    (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
  const footer = (buffer[5] & 0x10) !== 0 ? 10 : 0;
  return Math.min(10 + size + footer, buffer.length);
}

export class Mp3ReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Mp3ReadError';
  }
}

/**
 * Durée totale en secondes. Fonctionne aussi en débit variable : chaque trame
 * apporte sa propre durée, on ne déduit rien d'un débit moyen.
 *
 * L'en-tête Xing d'un fichier VBR occupe la première trame, qui est une vraie
 * trame de silence — elle est donc comptée, et c'est correct : elle est jouée.
 */
export function mp3DurationSeconds(buffer: Buffer): number {
  let offset = firstFrameOffset(buffer);
  let seconds = 0;
  let frames = 0;
  let gap = 0;

  while (offset < buffer.length) {
    const frame = frameAt(buffer, offset);
    if (frame) {
      const samples =
        frames === 0
          ? encoderGapSamples(buffer, offset, frame.sideInfoBytes)
          : null;

      frames += 1;
      offset += frame.bytes;

      // La trame qui porte l'en-tête Xing n'est pas de l'audio : elle existe
      // pour être lue, pas pour être entendue. Elle ne compte donc pas — c'est
      // aussi la convention du champ `frames` de cet en-tête.
      if (samples !== null) {
        gap = samples / frame.sampleRate;
        continue;
      }

      seconds += frame.seconds;
      continue;
    }
    offset += 1;
  }

  if (frames === 0) {
    throw new Mp3ReadError(
      'This audio carries no readable mp3 frame, so the scene has no ' +
        'measurable duration.'
    );
  }

  return Number(Math.max(0, seconds - gap).toFixed(3));
}
