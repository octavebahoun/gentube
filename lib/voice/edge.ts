import type { Readable } from 'node:stream';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { WordTiming } from '@/lib/storyboard/render';
import {
  VoiceError,
  VoiceNotConfiguredError,
  read,
  round,
  type Voiceover,
  type VoiceSynthesizer,
} from './contract';
import { mp3DurationSeconds } from './mp3';

/**
 * La voix qui mesure — celle d'avant la facture.
 *
 * Le prix d'une vidéo est la somme des durées de ses scènes, et une durée ne
 * s'obtient qu'en faisant lire la phrase. Il faut donc parler **avant** que le
 * client valide, alors qu'il n'a encore rien payé. Faire ça avec Polly ou
 * ElevenLabs, ce serait payer chaque devis, y compris ceux qui n'aboutissent
 * pas.
 *
 * Edge TTS est le service de lecture à voix haute du navigateur Edge. Il est
 * gratuit et rend des *word boundaries*, donc des timings mot à mot. C'est lui
 * qui fixe le prix ; la voix livrée après validation est une autre
 * (`./polly`, `./elevenlabs`), et **elle ne rejoue jamais le calcul** — le
 * montant du bouton est le montant débité.
 *
 * **Ce qu'il faut savoir avant de s'y appuyer.** Ce n'est pas une API publique :
 * ni contrat, ni SLA, ni promesse de stabilité. Elle peut changer sans préavis,
 * et elle se trouve sur le chemin du prix. Le jour où elle casse, il faut
 * pouvoir basculer la mesure sur Polly — d'où le fait que tout passe par
 * `VoiceSynthesizer`.
 */

/**
 * Noms courts partagés avec Polly, pour qu'un même `voiceId` de projet donne
 * une voix comparable des deux côtés : même genre, même accent. Sans ça, le
 * client entendrait une femme dans son aperçu et un homme dans sa vidéo.
 */
export const EDGE_VOICES: Record<string, string> = {
  lea: 'fr-FR-DeniseNeural',
  remi: 'fr-FR-HenriNeural',
  gabrielle: 'fr-CA-SylvieNeural',
};

export const DEFAULT_EDGE_VOICE = 'lea';
const DEFAULT_TIMEOUT_MS = 30_000;

export type EdgeConfig = {
  defaultVoice: string;
  timeoutMs: number;
};

export function edgeConfig(): EdgeConfig {
  // Edge TTS n'a pas de clé : rien ne l'empêcherait donc d'être appelé depuis
  // un test qui a oublié d'injecter un double. Gratuit ne veut pas dire qu'on
  // a le droit de marteler le service de Microsoft depuis une CI.
  if (read('EDGE_TTS_DISABLED') === '1') {
    throw new VoiceNotConfiguredError('EDGE_TTS_DISABLED is set');
  }

  const timeout = Number(read('EDGE_TTS_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS);

  return {
    defaultVoice: read('EDGE_TTS_VOICE') ?? DEFAULT_EDGE_VOICE,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

export function isEdgeConfigured(): boolean {
  try {
    edgeConfig();
    return true;
  } catch {
    return false;
  }
}

/** Liste fermée : un identifiant d'un autre fournisseur ne veut rien dire ici. */
export function resolveEdgeVoice(voice?: string | null): string {
  const wanted = voice?.trim().toLowerCase();
  if (wanted && EDGE_VOICES[wanted]) return EDGE_VOICES[wanted];
  if (wanted && /^[a-z]{2}-[A-Za-z]{2,3}-[A-Za-z]+Neural$/i.test(wanted)) {
    return voice!.trim();
  }
  return EDGE_VOICES[DEFAULT_EDGE_VOICE];
}

/** Cent nanosecondes : l'unité des offsets de l'API. */
const TICKS_PER_SECOND = 10_000_000;

/**
 * Lit les *word boundaries* d'Edge.
 *
 * Chaque message est un objet JSON entier — pas une ligne d'un flux à
 * recoller — de la forme
 * `{"Metadata":[{"Type":"WordBoundary","Data":{"Offset":…,"Duration":…,"text":{"Text":"Une"}}}]}`.
 *
 * Edge donne le début **et** la durée de chaque mot, là où Polly ne donne que
 * le début. C'est donc lui, et pas le mp3, qui dit la longueur de la parole.
 */
export function wordsFromBoundaries(chunks: string[]): WordTiming[] {
  const words: WordTiming[] = [];

  for (const chunk of chunks) {
    let parsed: { Metadata?: unknown };
    try {
      parsed = JSON.parse(chunk);
    } catch {
      // Un message illisible ne doit pas emporter tout l'alignement.
      continue;
    }
    if (!Array.isArray(parsed.Metadata)) continue;

    for (const entry of parsed.Metadata) {
      const data = (entry as { Type?: unknown; Data?: Record<string, unknown> })
        ?.Data;
      if ((entry as { Type?: unknown })?.Type !== 'WordBoundary' || !data) {
        continue;
      }

      const text = (data.text as { Text?: unknown } | undefined)?.Text;
      if (
        typeof text !== 'string' ||
        !text.trim() ||
        typeof data.Offset !== 'number' ||
        typeof data.Duration !== 'number'
      ) {
        continue;
      }

      words.push({
        text,
        start: round(data.Offset / TICKS_PER_SECOND),
        duration: round(Math.max(0, data.Duration / TICKS_PER_SECOND)),
      });
    }
  }

  return words;
}

/**
 * La seule chose que le client a besoin de faire : parler, et rendre les
 * octets et les messages. Le WebSocket ne traverse pas cette frontière, donc
 * un test n'a pas à en simuler un.
 */
export interface EdgeTransport {
  speak(
    voiceName: string,
    text: string,
    timeoutMs: number
  ): Promise<{ audio: Buffer; metadata: string[] }>;
}

function drain(
  audioStream: Readable,
  metadataStream: Readable | null,
  timeoutMs: number
): Promise<{ audio: Buffer; metadata: string[] }> {
  return new Promise((resolve, reject) => {
    const audio: Buffer[] = [];
    const metadata: string[] = [];

    const timer = setTimeout(() => {
      audioStream.destroy();
      reject(new VoiceError('Edge TTS stopped answering.', 504));
    }, timeoutMs);

    const done = () => {
      clearTimeout(timer);
      resolve({ audio: Buffer.concat(audio), metadata });
    };

    metadataStream?.on('data', (chunk) => metadata.push(String(chunk)));
    audioStream.on('data', (chunk: Buffer) => audio.push(chunk));
    // La bibliothèque détruit les deux flux à la fin d'un tour : `close` est
    // donc le signal de fin, `end` ne vient pas toujours.
    audioStream.once('end', done);
    audioStream.once('close', done);
    audioStream.once('error', (error) => {
      clearTimeout(timer);
      reject(new VoiceError(`Edge TTS failed: ${error.message}`));
    });
  });
}

class WebSocketEdgeTransport implements EdgeTransport {
  async speak(voiceName: string, text: string, timeoutMs: number) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(
        voiceName,
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
        { wordBoundaryEnabled: true }
      );
      const { audioStream, metadataStream } = tts.toStream(text);
      return await drain(audioStream, metadataStream, timeoutMs);
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      throw new VoiceError(
        `Edge TTS refused the request: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      tts.close();
    }
  }
}

export class EdgeVoiceClient implements VoiceSynthesizer {
  constructor(
    private readonly config: EdgeConfig = edgeConfig(),
    private readonly transport: EdgeTransport = new WebSocketEdgeTransport()
  ) {}

  async synthesize(text: string, voice?: string | null): Promise<Voiceover> {
    const spoken = text.trim();
    if (!spoken) {
      throw new VoiceError('Nothing to read: the narration is empty.', 400);
    }

    const { audio, metadata } = await this.transport.speak(
      resolveEdgeVoice(voice ?? this.config.defaultVoice),
      spoken,
      this.config.timeoutMs
    );

    if (audio.length === 0) {
      throw new VoiceError('Edge TTS answered without any audio.');
    }

    const words = wordsFromBoundaries(metadata);
    const last = words[words.length - 1];

    return {
      audio,
      contentType: 'audio/mpeg',
      // La longueur de la parole, pas celle du fichier : le silence de fin
      // n'est pas facturé, et le renderer pose sa propre pause après la voix.
      // Sans alignement il reste le mp3, qui n'est jamais faux, seulement large.
      durationS: last
        ? round(last.start + last.duration)
        : mp3DurationSeconds(audio),
      words,
    };
  }
}

export function createEdgeClient(): EdgeVoiceClient {
  return new EdgeVoiceClient(edgeConfig());
}
