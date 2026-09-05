import { describe, expect, it } from 'vitest';
import type { ChatMessage, JsonCompleter } from '@/lib/llm/deepseek';
import {
  appliqueCadrage,
  buildCadrageMessages,
  cadre,
  cadrageSchema,
  type SceneACadrer,
} from '@/lib/storyboard/cadrage';

const SCENES: SceneACadrer[] = [
  { order: 1, narration: 'Elles avancent au lever du jour.', prompt: 'Warriors walking' },
  { order: 2, narration: 'Elles étaient six mille.', prompt: '' },
  { order: 3, narration: 'Le roi les regarde partir.', prompt: 'A king watching' },
];

function repond(data: unknown, journal?: ChatMessage[][]): JsonCompleter {
  return {
    async completeJson(messages) {
      journal?.push(messages);
      return {
        data,
        usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
      };
    },
  };
}

const BONNE_REPONSE = {
  casting: [
    { name: 'Amazon', description: 'a tall woman in indigo cloth, shaved head' },
  ],
  shots: [
    { order: 1, prompt: 'a tall woman in indigo cloth, shaved head, walking, wide shot, dawn haze' },
    { order: 2, prompt: '' },
    { order: 3, prompt: 'an old king on a carved stool, watching, medium shot, low firelight' },
  ],
};

describe('la demande faite au cadreur', () => {
  it('porte la voix et le brouillon de chaque plan', () => {
    const [systeme, utilisateur] = buildCadrageMessages({
      scenes: SCENES,
      theme: 'Les Amazones',
      stylePrompt: '  sepia archive  ',
      registre: 'explainer',
    });

    expect(systeme.content).toContain('director of photography');
    expect(utilisateur.content).toContain('Les Amazones');
    expect(utilisateur.content).toContain('Register: explainer');
    expect(utilisateur.content).toContain('sepia archive');
    expect(utilisateur.content).toContain('voice: Elles avancent au lever du jour.');
    expect(utilisateur.content).toContain('draft: Warriors walking');
    // Une scène qui se dessine doit être annoncée comme telle, sinon le
    // cadreur lui invente un visuel que personne n'affichera.
    expect(utilisateur.content).toContain('this shot draws itself');
  });
});

describe('ce qu on retient de la réponse', () => {
  it('reprend les prompts réécrits', () => {
    const sortie = appliqueCadrage(SCENES, cadrageSchema.parse(BONNE_REPONSE));

    expect(sortie.get(1)).toContain('indigo cloth');
    expect(sortie.get(3)).toContain('low firelight');
  });

  it('garde le brouillon des plans que le cadreur a oubliés', () => {
    const sortie = appliqueCadrage(
      SCENES,
      cadrageSchema.parse({ shots: [{ order: 1, prompt: 'a lit wide shot at dawn' }] })
    );

    // Un plan sans visuel échouerait chez le fournisseur : mieux vaut terne
    // que vide.
    expect(sortie.get(3)).toBe('A king watching');
  });

  it('garde le brouillon quand le cadreur rend un prompt trop court', () => {
    const sortie = appliqueCadrage(
      SCENES,
      cadrageSchema.parse({ shots: [{ order: 1, prompt: 'dawn' }] })
    );

    expect(sortie.get(1)).toBe('Warriors walking');
  });

  it('laisse vide une scène qui se dessine, même si le cadreur insiste', () => {
    const sortie = appliqueCadrage(
      SCENES,
      cadrageSchema.parse({ shots: [{ order: 2, prompt: 'six thousand women in ranks' }] })
    );

    expect(sortie.get(2)).toBe('');
  });
});

describe('la passe complète', () => {
  it('ne lève jamais et rend les brouillons quand le cadreur déraille', async () => {
    const sortie = await cadre(SCENES, {
      client: repond({ nonsense: true }),
      theme: 'Les Amazones',
    });

    expect(sortie.get(1)).toBe('Warriors walking');
    expect(sortie.get(3)).toBe('A king watching');
  });

  it('ne lève jamais et rend les brouillons quand l appel échoue', async () => {
    const casse: JsonCompleter = {
      async completeJson() {
        throw new Error('502 from the provider');
      },
    };

    const sortie = await cadre(SCENES, { client: casse, theme: 'Les Amazones' });
    expect(sortie.get(1)).toBe('Warriors walking');
  });

  it('n appelle personne quand aucune scène n a de visuel', async () => {
    const journal: ChatMessage[][] = [];
    const sortie = await cadre(
      [{ order: 1, narration: 'Six mille.', prompt: '' }],
      { client: repond(BONNE_REPONSE, journal), theme: 'Les Amazones' }
    );

    // Un appel payé pour ne rien cadrer.
    expect(journal).toHaveLength(0);
    expect(sortie.get(1)).toBe('');
  });

  it('rend les prompts réécrits quand tout va bien', async () => {
    const sortie = await cadre(SCENES, {
      client: repond(BONNE_REPONSE),
      theme: 'Les Amazones',
      stylePrompt: 'sepia archive',
      registre: 'explainer',
    });

    expect(sortie.get(1)).toContain('wide shot');
    expect(sortie.get(2)).toBe('');
    expect(sortie.get(3)).toContain('medium shot');
  });
});
