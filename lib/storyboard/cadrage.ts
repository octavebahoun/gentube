import { z } from 'zod';
import type { ChatMessage, JsonCompleter } from '@/lib/llm/deepseek';

/**
 * La deuxième passe : réécrire les prompts visuels.
 *
 * **Pourquoi une passe séparée.** Le `prompt` d'une scène est le seul texte de
 * toute la chaîne qui décide des pixels — c'est lui, et rien d'autre, qui part
 * chez Wan ou p-video. Or le modèle du storyboard l'écrit *en passant*, entre
 * la narration, le ton et le contenu structuré : il a douze choses en tête et
 * le visuel n'en est qu'une. Le résultat est correct et générique.
 *
 * Un agent qui ne fait que ça, avec toutes les scènes sous les yeux, fait deux
 * choses que le premier ne peut pas faire :
 *
 * 1. **Cadrer.** Un sujet, une action, une échelle de plan, une lumière. Un
 *    modèle d'image ne devine pas « plan large » ; il faut l'écrire.
 * 2. **Tenir le casting.** Une personne décrite autrement à chaque scène est
 *    une personne différente à l'écran. La description exacte du sujet est
 *    fixée une fois et recopiée telle quelle dans chaque plan où il revient.
 *    C'est le point qui sépare une suite d'images d'une vidéo.
 *
 * **Ce que cette passe ne fait jamais** : changer ce qu'une scène montre. Elle
 * ne réécrit pas le film, elle l'éclaire.
 */

/** Le prompt visuel le plus long qu'on accepte de stocker. */
const MAX_PROMPT = 1_000;

export const CADRAGE_SYSTEM_PROMPT = [
  'You are a director of photography. You do NOT write the film: you light it.',
  '',
  'You receive the shots of a short video, each with the line the voice reads',
  'and a first draft of the visual. You rewrite each visual so an image model',
  'can shoot it. You never change WHAT a shot shows.',
  '',
  'Answer with ONLY a JSON object of this exact shape:',
  '{"casting":[{"name":"...","description":"..."}],',
  '"shots":[{"order":1,"prompt":"..."}]}',
  '',
  'Rules:',
  '- Return one entry in `shots` for EVERY order you are given, and no other.',
  '  Never merge two shots, never add one.',
  '- A shot given with an empty draft draws itself and needs no image: return',
  '  it with an empty `prompt`. Do not invent a visual for it.',
  '- Write in ENGLISH, whatever the language of the narration.',
  '- Each `prompt` names, in this order: the subject, what it does, the shot',
  '  size (wide shot / medium shot / close-up), and the light. An image model',
  '  does not guess a framing — an unwritten one comes out as a default',
  '  mid-distance shot, and a whole video of those reads as one long shot.',
  '- `casting` holds every subject that appears in MORE THAN ONE shot: a',
  '  person, an animal, a place, a recurring object. Describe each one once,',
  '  precisely enough to be redrawn — age, build, hair, clothing and colours',
  '  for a person; materials, era and colours for a place.',
  '- Then copy that description VERBATIM into every shot where the subject',
  '  appears. Not a paraphrase: the same words. A person described differently',
  '  in two shots is two different people on screen, and the video falls apart.',
  '- Never write text, letters, numbers, logos or a watermark into a shot: the',
  '  models render them as garbage, and the video already carries its own',
  '  subtitles.',
  '- Do not name a camera brand, a film stock, an artist or a studio. Describe',
  '  the light and the lens instead — soft window light, backlit haze, shallow',
  '  depth of field.',
  `- Keep each \`prompt\` under ${MAX_PROMPT} characters.`,
].join('\n');

export type SceneACadrer = {
  order: number;
  narration: string;
  /** Le brouillon du premier modèle. Vide pour une scène qui se dessine. */
  prompt: string;
};

export const cadrageSchema = z.object({
  casting: z
    .array(z.object({ name: z.string(), description: z.string() }))
    .optional(),
  shots: z
    .array(
      z.object({
        order: z.number().int().positive(),
        prompt: z.preprocess(
          (value) => (typeof value === 'string' ? value.trim() : value),
          z.string().max(MAX_PROMPT)
        ),
      })
    )
    .min(1),
});

export function buildCadrageMessages({
  scenes,
  theme,
  stylePrompt,
  registre,
}: {
  scenes: SceneACadrer[];
  theme: string;
  stylePrompt?: string | null;
  registre?: string;
}): ChatMessage[] {
  const user = [
    `Video theme: ${theme}`,
    registre ? `Register: ${registre}` : null,
    // Le style du projet est recollé une seconde fois par `visualPrompt()`.
    // Il est donné ici pour que le cadreur écrive DANS ce style, pas pour
    // qu'il le recopie dans chaque plan — la consigne est juste en dessous.
    stylePrompt?.trim()
      ? `Project style, already appended to every shot downstream — write in ` +
        `keeping with it, but never restate it: ${stylePrompt.trim()}`
      : null,
    '',
    'Shots:',
    ...scenes.map((scene) =>
      [
        `- order ${scene.order}`,
        `  voice: ${scene.narration}`,
        scene.prompt ? `  draft: ${scene.prompt}` : '  draft: (none, this shot draws itself)',
      ].join('\n')
    ),
  ]
    .filter((ligne) => ligne !== null)
    .join('\n');

  return [
    { role: 'system', content: CADRAGE_SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

/**
 * Recolle le casting dans les prompts, et rend l'ordre au reste de la chaîne.
 *
 * Une scène absente de la réponse garde son brouillon : le modèle en oubliera,
 * et un plan sans visuel échouerait chez le fournisseur. Une scène rendue vide
 * alors qu'elle avait un brouillon le garde aussi — c'est presque toujours un
 * oubli, jamais une intention.
 */
export function appliqueCadrage(
  scenes: SceneACadrer[],
  reponse: z.infer<typeof cadrageSchema>
): Map<number, string> {
  const parOrdre = new Map(reponse.shots.map((shot) => [shot.order, shot.prompt]));
  const sortie = new Map<number, string>();

  for (const scene of scenes) {
    const propose = parOrdre.get(scene.order);
    // Une scène qui se dessine n'a pas de visuel, et n'en veut pas.
    if (!scene.prompt) {
      sortie.set(scene.order, '');
      continue;
    }
    sortie.set(scene.order, propose && propose.length >= 10 ? propose : scene.prompt);
  }

  return sortie;
}

/**
 * La passe complète. **Ne lève jamais.**
 *
 * Le storyboard est déjà écrit et les crédits déjà débités quand on arrive
 * ici : un cadreur en panne doit coûter un rendu plus terne, pas la génération
 * entière. Toute erreur rend les brouillons tels quels.
 */
export async function cadre(
  scenes: SceneACadrer[],
  {
    client,
    theme,
    stylePrompt,
    registre,
  }: {
    client: JsonCompleter;
    theme: string;
    stylePrompt?: string | null;
    registre?: string;
  }
): Promise<Map<number, string>> {
  const aCadrer = scenes.filter((scene) => scene.prompt);
  if (aCadrer.length === 0) {
    return new Map(scenes.map((scene) => [scene.order, '']));
  }

  try {
    const completion = await client.completeJson(
      buildCadrageMessages({ scenes, theme, stylePrompt, registre })
    );
    return appliqueCadrage(scenes, cadrageSchema.parse(completion.data));
  } catch {
    return new Map(scenes.map((scene) => [scene.order, scene.prompt]));
  }
}
