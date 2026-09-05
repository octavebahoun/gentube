import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_AUDIO_BYTES,
  TranscriptionError,
  TranscriptionNotConfiguredError,
  WhisperTranscriber,
  isTranscriptionConfigured,
  toWordTimings,
  transcriptionConfig,
} from './whisper';

const VARS = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_AI_TOKEN',
  'CLOUDFLARE_TRANSCRIBE_MODEL',
  'CLOUDFLARE_AI_BASE_URL',
] as const;

function configure(overrides: Partial<Record<(typeof VARS)[number], string>> = {}) {
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
  process.env.CLOUDFLARE_AI_TOKEN = 'tok-1';
  for (const [name, value] of Object.entries(overrides)) {
    process.env[name] = value;
  }
}

afterEach(() => {
  for (const name of VARS) process.env[name] = '';
  vi.unstubAllGlobals();
});

/** Une réponse Workers AI, dans la forme réelle : tout sous `result`. */
function repond(result: unknown, { ok = true, status = 200 } = {}) {
  const fetchDouble = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ success: ok, result }), { status })
  );
  vi.stubGlobal('fetch', fetchDouble);
  return fetchDouble;
}

describe('la configuration', () => {
  it('exige le compte puis le jeton, en nommant lequel manque', () => {
    for (const name of VARS) process.env[name] = '';
    expect(() => transcriptionConfig()).toThrow(TranscriptionNotConfiguredError);
    expect(() => transcriptionConfig()).toThrow(/CLOUDFLARE_ACCOUNT_ID/);

    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
    expect(() => transcriptionConfig()).toThrow(/CLOUDFLARE_AI_TOKEN/);
  });

  it('retient le modèle à bornes par mot par défaut', () => {
    configure();
    // Le seul du catalogue Cloudflare qui rende des bornes par mot : un
    // découpage par segment de dix secondes ne ferait pas de karaoké.
    expect(transcriptionConfig().model).toContain('whisper-large-v3-turbo');
    expect(isTranscriptionConfigured()).toBe(true);
  });

  it('coupe la barre finale de l URL de base', () => {
    configure({ CLOUDFLARE_AI_BASE_URL: 'https://proxy.test/v4/' });
    expect(transcriptionConfig().baseUrl).toBe('https://proxy.test/v4');
  });
});

describe('la conversion des bornes en durées', () => {
  it('passe d une fin à une durée', () => {
    expect(
      toWordTimings([
        { word: 'Voici', start: 0, end: 0.42 },
        { word: ' le', start: 0.42, end: 0.55 },
      ])
    ).toEqual([
      { text: 'Voici', start: 0, duration: 0.42 },
      { text: 'le', start: 0.42, duration: 0.13 },
    ]);
  });

  it('donne une durée plancher à un mot dont la fin précède le début', () => {
    // Ça arrive sur les silences mal découpés. Jeter le mot décalerait
    // visuellement toute la fin de la phrase.
    const [mot] = toWordTimings([{ word: 'euh', start: 2, end: 1.8 }]);
    expect(mot.duration).toBeGreaterThan(0);
    expect(mot.text).toBe('euh');
  });

  it('recolle les fragments qui ne vivent pas seuls', () => {
    // Whisper tokenise : « qu'elle » sort en `qu` puis `'elle`, et le rendu
    // affichait « qu 'elle n 'avait ». Le karaoké allume un mot à la fois,
    // donc les deux moitiés s'allumaient séparément.
    expect(
      toWordTimings([
        { word: ' qu', start: 1, end: 1.1 },
        { word: " 'elle", start: 1.1, end: 1.4 },
        { word: ' vidéo', start: 1.4, end: 1.8 },
        { word: ' !', start: 1.8, end: 1.86 },
      ])
    ).toEqual([
      // Le mot fusionné garde le début du premier et la fin du dernier.
      { text: "qu'elle", start: 1, duration: 0.4 },
      // Espace fine insécable devant le « ! », comme le veut le français —
      // et insécable parce qu'un sous-titre passe à la ligne.
      { text: 'vidéo\u202f!', start: 1.4, duration: 0.46 },
    ]);
  });

  it('ne recolle rien quand le fragment ouvre la phrase', () => {
    // Sans mot précédent, il n'y a rien à quoi coller : le garder vaut mieux
    // que le perdre.
    expect(toWordTimings([{ word: " 'elle", start: 0, end: 0.3 }])).toEqual([
      { text: "'elle", start: 0, duration: 0.3 },
    ]);
  });

  it('jette les mots vides et rien d autre', () => {
    expect(toWordTimings([{ word: '  ', start: 0, end: 1 }, { word: 'oui', start: 1, end: 2 }]))
      .toHaveLength(1);
  });
});

describe('la transcription', () => {
  it('poste du JSON base64 et met les mots des segments à plat', async () => {
    configure();
    const fetchDouble = repond({
      text: ' Voici le tableau de bord. ',
      transcription_info: { language: 'fr' },
      // Les mots vivent DANS les segments, et leurs bornes sont absolues.
      // Vérifié contre l'API réelle : `result.words` n'existe pas, et le lire
      // rendait un tableau vide sans erreur — des sous-titres muets, en
      // silence.
      segments: [
        {
          start: 0,
          end: 0.52,
          words: [
            { word: ' Voici', start: 0, end: 0.4 },
            { word: ' le', start: 0.4, end: 0.52 },
          ],
        },
        {
          start: 1.1,
          end: 1.6,
          words: [{ word: ' bord', start: 1.1, end: 1.6 }],
        },
      ],
    });

    const sortie = await new WhisperTranscriber().transcribe(Buffer.from('mp3'), {
      language: 'fr',
    });

    expect(sortie.text).toBe('Voici le tableau de bord.');
    expect(sortie.language).toBe('fr');
    expect(sortie.words).toHaveLength(3);
    // Absolues, donc rien à décaler : le mot du second segment garde 1,1 s.
    expect(sortie.words[2]).toEqual({ text: 'bord', start: 1.1, duration: 0.5 });

    const [, init] = fetchDouble.mock.calls[0];
    // Du JSON, pas du multipart : c'est l'inverse des images sur le même
    // fournisseur, et un multipart ici répond « AiError: Invalid input ».
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    const envoye = JSON.parse(init.body as string);
    expect(envoye.audio).toBe(Buffer.from('mp3').toString('base64'));
    expect(envoye.task).toBe('transcribe');
    expect(envoye.language).toBe('fr');
  });

  it('refuse un audio vide sans appeler personne', async () => {
    configure();
    const fetchDouble = repond({ text: 'jamais atteint' });

    await expect(new WhisperTranscriber().transcribe(Buffer.alloc(0))).rejects.toThrow(
      /no audio/
    );
    expect(fetchDouble).not.toHaveBeenCalled();
  });

  it('refuse un audio trop lourd en disant quoi faire', async () => {
    configure();
    const fetchDouble = repond({ text: 'jamais atteint' });

    await expect(
      new WhisperTranscriber().transcribe(Buffer.alloc(MAX_AUDIO_BYTES + 1))
    ).rejects.toThrow(/Extract the audio track/);
    expect(fetchDouble).not.toHaveBeenCalled();
  });

  it('remonte un refus du fournisseur avec sa raison', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ success: false, errors: [{ message: 'unsupported codec' }] }),
            { status: 200 }
          )
      )
    );

    await expect(new WhisperTranscriber().transcribe(Buffer.from('mp3'))).rejects.toThrow(
      /unsupported codec/
    );
  });

  it('remonte un code HTTP avec un extrait du corps', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad Request: audio too short', { status: 400 }))
    );

    await expect(new WhisperTranscriber().transcribe(Buffer.from('mp3'))).rejects.toThrow(
      /HTTP 400.*audio too short/
    );
  });

  it('refuse un silence plutôt que de rendre un texte vide', async () => {
    configure();
    repond({ text: '   ', segments: [] });

    // Sans ça, la vidéo sortirait avec des sous-titres vides et personne ne
    // saurait que la piste était muette.
    await expect(new WhisperTranscriber().transcribe(Buffer.from('mp3'))).rejects.toThrow(
      TranscriptionError
    );
  });

  it('accepte un texte sans segments', async () => {
    configure();
    repond({ text: 'Voici le tableau de bord.' });

    // La composition retombe sur un découpage régulier : un sous-titre
    // approximatif vaut mieux que pas de sous-titre.
    const sortie = await new WhisperTranscriber().transcribe(Buffer.from('mp3'));
    expect(sortie.text).toBe('Voici le tableau de bord.');
    expect(sortie.words).toEqual([]);
  });
});
