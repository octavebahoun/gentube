/**
 * La bande son d'une vidéo déposée, extraite dans le navigateur.
 *
 * **Pourquoi le navigateur.** Whisper transcrit de l'audio, pas de la vidéo :
 * envoyer un MP4 de cent mégaoctets à Workers AI dépasse son plafond de
 * vingt-cinq, et ne servirait de toute façon qu'à faire décoder la piste par
 * quelqu'un. Le serveur, lui, ne sait pas extraire : il n'y a pas de ffmpeg
 * dans une fonction serverless, et il n'y en aura pas.
 *
 * Le navigateur du client a déjà le fichier en main et un décodeur audio
 * complet — c'est le seul endroit de la chaîne où l'extraction est gratuite.
 * C'était le dernier trou entre la démonstration du cas 4 et la plateforme.
 *
 * **Pourquoi du WAV et pas du MP3.** Encoder du MP3 demande une bibliothèque ;
 * le WAV est un en-tête de quarante-quatre octets suivi des échantillons, donc
 * zéro dépendance et un encodeur qu'on peut tester. Il pèse plus lourd, mais
 * en mono 16 kHz — ce que la reconnaissance vocale utilise de toute façon —
 * c'est 32 Ko par seconde, soit treize minutes sous le plafond de Workers AI.
 * Une vidéo de cent mégaoctets fait rarement plus.
 */

/** Le format que la reconnaissance vocale attend, et le plus léger qui la sert. */
export const TAUX_ASR = 16_000;

/**
 * Emballe des échantillons en fichier WAV.
 *
 * Mono, 16 bits signés, petit-boutiste — le seul format que tout le monde lit
 * sans négocier. Les flottants arrivent dans [-1, 1] et peuvent déborder après
 * un rééchantillonnage : on les borne avant de convertir, sinon un dépassement
 * repasse de l'autre côté et fait claquer l'échantillon.
 */
export function toWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const octets = new ArrayBuffer(44 + samples.length * 2);
  const vue = new DataView(octets);

  const texte = (offset: number, valeur: string) => {
    for (let i = 0; i < valeur.length; i += 1) {
      vue.setUint8(offset + i, valeur.charCodeAt(i));
    }
  };

  texte(0, 'RIFF');
  vue.setUint32(4, 36 + samples.length * 2, true);
  texte(8, 'WAVE');
  texte(12, 'fmt ');
  vue.setUint32(16, 16, true); // taille du bloc fmt
  vue.setUint16(20, 1, true); // PCM entier
  vue.setUint16(22, 1, true); // un canal
  vue.setUint32(24, sampleRate, true);
  vue.setUint32(28, sampleRate * 2, true); // octets par seconde
  vue.setUint16(32, 2, true); // octets par trame
  vue.setUint16(34, 16, true); // bits par échantillon
  texte(36, 'data');
  vue.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i += 1) {
    const borne = Math.max(-1, Math.min(1, samples[i]));
    // Asymétrique parce que le complément à deux l'est : 32767 en haut,
    // 32768 en bas. Un seul facteur ferait saturer un côté avant l'autre.
    vue.setInt16(44 + i * 2, borne < 0 ? borne * 0x8000 : borne * 0x7fff, true);
  }

  return new Uint8Array(octets);
}

/** Ce que le navigateur doit fournir. Nommé pour pouvoir le doubler en test. */
type FabriqueAudio = {
  decode(bytes: ArrayBuffer): Promise<AudioBuffer>;
  resample(source: AudioBuffer, taux: number): Promise<Float32Array>;
};

/**
 * Le décodeur du navigateur, isolé derrière une interface.
 *
 * `AudioContext` n'existe pas dans Node : sans cette séparation, le fichier
 * entier deviendrait intestable et l'encodeur avec lui.
 */
function fabriqueDuNavigateur(): FabriqueAudio {
  return {
    async decode(bytes) {
      const ctx = new AudioContext();
      try {
        return await ctx.decodeAudioData(bytes);
      } finally {
        void ctx.close();
      }
    },
    async resample(source, taux) {
      const longueur = Math.ceil(source.duration * taux);
      const hors = new OfflineAudioContext(1, longueur, taux);
      const lecteur = hors.createBufferSource();
      lecteur.buffer = source;
      lecteur.connect(hors.destination);
      lecteur.start();
      const rendu = await hors.startRendering();
      return rendu.getChannelData(0);
    },
  };
}

export type BandeSon = { bytes: Uint8Array; sampleRate: number; durationS: number };

/**
 * Sort la bande son d'un fichier vidéo, en mono 16 kHz.
 *
 * **Elle ne jette jamais.** Un conteneur que le navigateur ne sait pas décoder
 * — un vieux MOV, un codec exotique — rend `null`, et le dépôt continue : la
 * vidéo se monte quand même, simplement sans sous-titres calés au mot. Faire
 * échouer un dépôt de cent mégaoctets parce qu'une transcription optionnelle
 * n'est pas possible serait le mauvais échange.
 *
 * Le repli sur le taux natif est là pour Safari, qui a longtemps refusé un
 * `OfflineAudioContext` en dessous de 44,1 kHz. Le fichier pèse alors trois
 * fois plus, ce qui reste sous le plafond pour les durées qui nous concernent.
 */
export async function extraireLaBandeSon(
  file: Blob,
  fabrique: FabriqueAudio = fabriqueDuNavigateur()
): Promise<BandeSon | null> {
  try {
    const decode = await fabrique.decode(await file.arrayBuffer());
    if (decode.duration <= 0) return null;

    let taux = TAUX_ASR;
    let samples: Float32Array;
    try {
      samples = await fabrique.resample(decode, taux);
    } catch {
      taux = decode.sampleRate;
      samples = await fabrique.resample(decode, taux);
    }

    return {
      bytes: toWav(samples, taux),
      sampleRate: taux,
      durationS: decode.duration,
    };
  } catch {
    return null;
  }
}
