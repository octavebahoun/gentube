import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Shot, Video } from '@/lib/db/schema';
import { sceneEffectsSchema, toHyperframesStoryboard } from './render';
import { composeHtml } from '@/lib/render/composition';

/*
 * La garde qui manquait : un champ du contrat doit changer la page.
 *
 * Le 3 septembre, 162 entrées étaient cochées et 160 rendaient une page
 * identique à l'octet près. Le storyboard demandait `vfxShatter`, le contrat
 * validait, la génération partait, la vidéo était facturée, et l'écran était
 * le même que sans. Aucun test ne l'a vu, et aucun ne pouvait : **un champ
 * optionnel que personne ne lit ne casse rien.**
 *
 * Celui-ci le voit. Pour chaque champ, on compose la page une fois avec lui et
 * une fois sans, et on compare. Ce qui ne change pas la page n'est pas rendu.
 */

const video = {
  title: 'Contrat',
  ratio: '16:9',
  resolution: '480p',
  voice: null,
  subtitles: true,
  subtitleStyle: 'karaoke',
  musicUrl: null,
  musicVolume: 0.09,
  sfxVolume: 1,
} as unknown as Video;

const shot = (render: Record<string, unknown>) =>
  ({
    id: 1,
    order: 1,
    type: 'image',
    prompt: 'un baobab',
    narration: 'Une phrase de trois mots.',
    subtitle: null,
    audioUrl: 'voice/s1.mp3',
    assetUrl: 'media/s1.jpg',
    durationS: 4,
    durationSource: 'measured',
    words: null,
    render,
  }) as unknown as Shot;

const page = (effects: Record<string, unknown>) =>
  composeHtml({ storyboard: toHyperframesStoryboard(video, [shot({ effects })]) });

/** Une valeur plausible pour n'importe quel schéma, devinée depuis sa forme. */
function valeur(schema: z.ZodTypeAny): unknown {
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  const type = (def.typeName ?? def.type) as string;
  if (type === 'ZodOptional' || type === 'optional') return valeur(def.innerType as z.ZodTypeAny);
  if (type === 'ZodDefault' || type === 'default') return valeur(def.innerType as z.ZodTypeAny);
  if (type === 'ZodString' || type === 'string') return 'Kofi';
  if (type === 'ZodNumber' || type === 'number') return 1;
  if (type === 'ZodBoolean' || type === 'boolean') return true;
  if (type === 'ZodEnum' || type === 'enum') {
    const valeurs = (def.values ?? Object.values((def.entries ?? {}) as object)) as unknown[];
    return valeurs[0];
  }
  if (type === 'ZodArray' || type === 'array') {
    const element = valeur((def.element ?? def.type) as z.ZodTypeAny);
    return [element, element];
  }
  if (type === 'ZodObject' || type === 'object') {
    const shape = (typeof def.shape === 'function' ? (def.shape as () => object)() : def.shape) as Record<string, z.ZodTypeAny>;
    return Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, valeur(v)]));
  }
  return {};
}

/**
 * Ceux dont la première valeur de l'énumération EST le défaut.
 *
 * `transition: 'none'` compose exactement la même page que pas de transition
 * du tout, et c'est juste. Ils pilotent le temps, pas le balisage.
 */
const PILOTES = ['zoom', 'transition', 'matchCut', 'onBeat', 'cameraMotion'];

/**
 * Le chantier : déclarés, pas encore dessinés, et on sait pourquoi.
 *
 * Cette liste ne doit que **rétrécir**. Un champ qui se met à dessiner la fait
 * échouer aussi : on le retire d'ici le jour où il est fait, sinon elle
 * redevient une liste écrite à la main qui ment.
 */
const CHANTIER: Record<string, string> = {
  terminalSimulator: 'plan de palier 3 : son contenu est une donnée',
  mkProgressStat: 'plan de palier 3 : la barre de progression du compteur',
  mkUsageArc: 'plan de palier 3 : un arc et sa valeur',
  gradeSplitReveal: 'nappe à écrire',
  badgeMatrix: 'champ en forme de compte : doit recevoir les noms',
  hwArrow: 'famille manuscrite, à écrire',
  hwUnderline: 'famille manuscrite, à écrire',
  hwTextCloud: 'famille manuscrite, à écrire',
  hwBoil: 'le tremblement seul : mesuré inerte, même à côté de hwFrame',
  panStations: 'travelling à écrire ; le compte est légitime, un arrêt est une position',
  scrollCameraStory: 'travelling à écrire ; même raison',
  avatarCloud: 'nuée à écrire ; le compte est légitime, une pastille ne porte pas de texte',
  overwhelmSurround: 'doit recevoir les noms : ses éléments portent du texte',
  multiplayerCursors: 'doit recevoir les étiquettes : un curseur en porte une',
  liquidGlassContextMenu: 'doit recevoir les entrées, et sans le verre dépoli',
  metricCalloutGrid: 'champ en forme de compte : doit recevoir les noms',
  staggerCascade: 'à regarder d abord : peut-être un doublon de staggerLattice',
};

/** Les formes que la devinette ne peut pas produire, écrites à la main. */
const A_LA_MAIN: Record<string, unknown> = {
  beatAccent: { beats: [1, 2, 3] },
  panStations: { stops: 3 },
  scrollCameraStory: { sections: 3 },
  multiplayerCursors: { count: 3 },
  metricCalloutGrid: { cards: 4 },
  avatarCloud: { count: 6 },
  overwhelmSurround: { itemsCount: 8 },
  staggerCascade: { columns: 3 },
  liquidGlassContextMenu: { itemsCount: 3 },
};

describe('every field of the contract draws something', () => {
  const shape = (sceneEffectsSchema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
  const nu = page({});

  const dessine = (nom: string) => {
    const v = A_LA_MAIN[nom] ?? valeur(shape[nom]);
    expect(sceneEffectsSchema.safeParse({ [nom]: v }).success, `${nom} : valeur invalide`).toBe(true);
    return page({ [nom]: v }) !== nu;
  };

  it('leaves no field that composes the same page as without it', () => {
    const muets = Object.keys(shape).filter(
      (nom) => !PILOTES.includes(nom) && !(nom in CHANTIER) && !dessine(nom)
    );
    expect(muets, 'déclarés mais muets — ni pilotes du temps, ni chantier connu').toEqual([]);
  });

  it('keeps the building site shrinking, never growing', () => {
    // Un champ du chantier qui dessine est fait : il sort de la liste.
    const faits = Object.keys(CHANTIER).filter((nom) => nom in shape && dessine(nom));
    expect(faits, 'ceux-ci dessinent : à retirer de CHANTIER').toEqual([]);
    const partis = Object.keys(CHANTIER).filter((nom) => !(nom in shape));
    expect(partis, 'ceux-ci ne sont plus au contrat : à retirer de CHANTIER').toEqual([]);
  });
});

describe('a rejected render is never lost in silence', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names the shot and the field instead of dropping the plan quietly', () => {
    const cri = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const faux = {
      ...shot({}),
      order: 9,
      // Les trois fautes vues sur la vidéo d'essai du 5 septembre.
      render: {
        effects: { transition: 'crossfade' },
        thread: { title: 'T', messages: [{ side: 'left', author: 'Ama', text: 'a' }] },
      },
    } as unknown as Shot;

    const storyboard = toHyperframesStoryboard(video, [faux]);

    expect(cri).toHaveBeenCalledTimes(1);
    const dit = String(cri.mock.calls[0][0]);
    expect(dit).toContain('plan 9');
    expect(dit).toContain('effects.transition');
    expect(dit).toContain('thread.messages');
    // Le rendu continue : perdre une vidéo entière pour un champ serait pire.
    expect(storyboard.scenes).toHaveLength(1);
  });

  it('says nothing when the render is sound', () => {
    const cri = vi.spyOn(console, 'warn').mockImplementation(() => {});
    toHyperframesStoryboard(video, [shot({ vignette: { strength: 0.5 } })]);
    expect(cri).not.toHaveBeenCalled();
  });
});
