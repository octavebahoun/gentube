import {
  PollyClient,
  SynthesizeSpeechCommand,
  type SynthesizeSpeechCommandInput,
} from '@aws-sdk/client-polly';
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
 * Voix off Amazon Polly — la voix par défaut de la plateforme.
 *
 * C'est le choix de `docs/tarifs.md` : la marge de 41 % du plan Starter en
 * dépend, Polly Neural coûtant un ordre de grandeur moins qu'ElevenLabs, qui
 * reste réservé à Pro et Business.
 *
 * **Deux appels par scène, et c'est incontournable.** Polly rend soit de
 * l'audio, soit des *speech marks* — jamais les deux dans une réponse. Or les
 * timings mot à mot ne sont pas un ornement : ce sont eux qui font les
 * sous-titres karaoké. Les caractères sont donc facturés deux fois, ce qui
 * reste très loin d'ElevenLabs.
 *
 * **Ce que Polly ne dit pas.** Ni la durée de l'audio, ni la fin du dernier
 * mot : un speech mark ne porte qu'un instant de départ. La durée — donc le
 * prix — est lue dans les en-têtes du mp3 (voir `./mp3`), et c'est elle qui
 * ferme le dernier mot.
 */

/**
 * Voix françaises compatibles avec le moteur neural, sous leur nom court.
 *
 * Volontairement une liste fermée. `Celine` et `Mathieu` n'y sont pas : elles
 * n'existent qu'en moteur standard et un appel neural sur elles échoue.
 */
export const POLLY_VOICES: Record<string, string> = {
  lea: 'Lea',
  remi: 'Remi',
  // Français canadien — accepté parce qu'un client peut le préférer.
  gabrielle: 'Gabrielle',
};

export const DEFAULT_POLLY_VOICE = 'lea';
const DEFAULT_ENGINE = 'neural';

export type PollyConfig = {
  region: string;
  engine: string;
  defaultVoice: string;
};

export function pollyConfig(): PollyConfig {
  // Les identifiants AWS sont les mêmes que ceux du rendu Lambda : un seul
  // compte, une seule paire de clés. POLLY_REGION n'existe que pour le cas où
  // Polly serait pris ailleurs que la région de rendu.
  if (!read('AWS_ACCESS_KEY_ID')) {
    throw new VoiceNotConfiguredError('AWS_ACCESS_KEY_ID');
  }
  if (!read('AWS_SECRET_ACCESS_KEY')) {
    throw new VoiceNotConfiguredError('AWS_SECRET_ACCESS_KEY');
  }
  const region = read('POLLY_REGION') ?? read('AWS_REGION');
  if (!region) throw new VoiceNotConfiguredError('AWS_REGION');

  return {
    region,
    engine: read('POLLY_ENGINE') ?? DEFAULT_ENGINE,
    defaultVoice: read('POLLY_DEFAULT_VOICE') ?? DEFAULT_POLLY_VOICE,
  };
}

export function isPollyConfigured(): boolean {
  try {
    pollyConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Résout un nom de voix. Liste fermée, sans repli devinatoire : le champ `voice`
 * d'un projet peut très bien porter un identifiant ElevenLabs, qui ne veut rien
 * dire ici. Mieux vaut la voix par défaut de Polly qu'un appel refusé.
 */
export function resolvePollyVoice(voice?: string | null): string {
  const wanted = voice?.trim().toLowerCase();
  if (wanted && POLLY_VOICES[wanted]) return POLLY_VOICES[wanted];
  return POLLY_VOICES[DEFAULT_POLLY_VOICE];
}

/**
 * Le seul geste que le client a besoin de poser : une requête, des octets.
 *
 * Ni le SDK ni ses commandes ne traversent cette frontière, donc un test
 * n'a pas à simuler un flux AWS pour vérifier le découpage des mots.
 */
export interface PollyTransport {
  synthesize(input: SynthesizeSpeechCommandInput): Promise<Buffer>;
}

class AwsPollyTransport implements PollyTransport {
  constructor(private readonly client: PollyClient) {}

  async synthesize(input: SynthesizeSpeechCommandInput): Promise<Buffer> {
    let output;
    try {
      output = await this.client.send(new SynthesizeSpeechCommand(input));
    } catch (error) {
      // Le message d'AWS nomme la voix ou le moteur en cause ; on le garde tel
      // quel. Il ne contient jamais la clé, qui ne sert qu'à signer.
      throw new VoiceError(
        `Polly refused the request: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (!output.AudioStream) {
      throw new VoiceError('Polly answered without a stream.');
    }
    return Buffer.from(await output.AudioStream.transformToByteArray());
  }
}

/**
 * Regroupe les speech marks en timings de mots.
 *
 * La réponse est du JSON ligne par ligne, pas un tableau — un objet par ligne,
 * `{"time":0,"type":"word","start":0,"end":3,"value":"Une"}`.
 *
 * Chaque mot est fermé par le début du suivant ; le dernier est fermé par la
 * durée totale de l'audio, seul endroit où elle soit connue. Sans elle, le
 * dernier mot du sous-titre aurait une durée nulle et clignoterait.
 */
export function wordsFromSpeechMarks(
  body: string,
  totalSeconds: number
): WordTiming[] {
  const starts: { text: string; start: number }[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let mark: { type?: unknown; time?: unknown; value?: unknown };
    try {
      mark = JSON.parse(trimmed);
    } catch {
      // Une ligne tronquée ne doit pas coûter tout l'alignement.
      continue;
    }

    if (
      mark.type !== 'word' ||
      typeof mark.time !== 'number' ||
      typeof mark.value !== 'string' ||
      !mark.value.trim()
    ) {
      continue;
    }
    starts.push({ text: mark.value, start: mark.time / 1000 });
  }

  return starts.map((word, index) => {
    const next = starts[index + 1]?.start ?? totalSeconds;
    return {
      text: word.text,
      start: round(word.start),
      duration: round(Math.max(0, next - word.start)),
    };
  });
}

export class PollyVoiceClient implements VoiceSynthesizer {
  constructor(
    private readonly config: PollyConfig = pollyConfig(),
    private readonly transport: PollyTransport = new AwsPollyTransport(
      new PollyClient({ region: config.region })
    )
  ) {}

  async synthesize(text: string, voice?: string | null): Promise<Voiceover> {
    const spoken = text.trim();
    if (!spoken) {
      throw new VoiceError('Nothing to read: the narration is empty.', 400);
    }

    const common = {
      Text: spoken,
      VoiceId: resolvePollyVoice(voice ?? this.config.defaultVoice),
      Engine: this.config.engine,
    } as SynthesizeSpeechCommandInput;

    // L'audio d'abord : sa durée est ce qui ferme le dernier mot, et c'est
    // aussi la seule sortie sans laquelle la scène ne peut pas être facturée.
    const audio = await this.transport.synthesize({
      ...common,
      OutputFormat: 'mp3',
    });
    const durationS = mp3DurationSeconds(audio);

    const marks = await this.transport.synthesize({
      ...common,
      OutputFormat: 'json',
      SpeechMarkTypes: ['word'],
    });
    const words = wordsFromSpeechMarks(marks.toString('utf8'), durationS);

    if (words.length === 0) {
      throw new VoiceError(
        'Polly returned audio without speech marks, so this scene has no ' +
          'word-by-word subtitles.'
      );
    }

    return { audio, contentType: 'audio/mpeg', words, durationS };
  }
}

export function createPollyClient(): PollyVoiceClient {
  return new PollyVoiceClient(pollyConfig());
}
