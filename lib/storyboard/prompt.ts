import { CARACTERES_PAR_SECONDE, lignesDesRegistres } from './registres';
import { minClipSeconds } from '@/lib/video/provider';

/**
 * Le plancher d'une scène animée, en caractères de narration.
 *
 * Calculé et pas écrit : le jour où le modèle d'animation change, la borne
 * suit sans qu'on ait à se souvenir de ce chiffre-là.
 *
 * Depuis la grille v1 il vaut une seconde, c'est-à-dire presque rien :
 * p-video facture à la seconde réelle. Wan imposait 5,06 s et cette contrainte
 * façonnait tout le storyboard — elle a disparu avec lui.
 */
function planchAnimeEnCaracteres(): number {
  return Math.ceil(minClipSeconds() * CARACTERES_PAR_SECONDE);
}

/**
 * Le plafond de scènes d'un storyboard.
 *
 * Il vit ici et non dans `service.ts` : le prompt le cite, et `service.ts`
 * importe le prompt. Dans l'autre sens c'était un cycle — invisible tant que
 * `service.ts` était chargé le premier, et net le jour où un script est entré
 * par `prompt.ts`.
 */
export const MAX_SHOTS = 30;

/**
 * Le prompt système : tout le vocabulaire de rendu, dit au modèle.
 *
 * Sorti de `service.ts` le 4 septembre 2026, à 743 lignes, avant d'y ajouter
 * deux plans de plus. C'est la moitié du fichier, il ne parle qu'au modèle, et
 * il grossit à chaque entrée du catalogue — la coupe naturelle.
 *
 * Une règle qui ne se voit pas en le lisant : **tout ce qui est décrit ici doit
 * exister dans `llmSceneSchema`**, sinon `parse` le jette en silence. Le
 * compteur a passé des semaines dans ce texte sans jamais arriver jusqu'à la
 * base, et chaque scène chiffrée rendait une image ordinaire — facturée.
 */

export const SYSTEM_PROMPT = [
  'You write storyboards for short videos assembled from AI-generated visuals',
  'and an AI voice-over.',
  '',
  'Answer with ONLY a JSON object of this exact shape:',
  '{"registre":"explainer","scenes":[{"narration":"...","type":"image",',
  '"prompt":"...","ton":"pose","sounds":[{"src":"..."}]}]}',
  '',
  'Rules:',
  '- `narration` is the line the voice reads out loud. Write it in the SAME',
  '  language as the theme. One or two spoken sentences per scene, no stage',
  '  directions, no scene numbers, no emoji, nothing unpronounceable.',
  '- `prompt` is the visual, in ENGLISH whatever the narration language: the',
  '  image and video models are trained on English captions. Describe one',
  '  continuous shot — subject, action, framing, light. No on-screen text.',
  '- `type` is `video` or `image`, and you write it on EVERY scene. It is the',
  '  first thing a scene needs and the easiest to forget: a scene without it',
  '  falls back to `image`, and a shot that needed movement comes out still.',
  /*
   * Le plancher du fournisseur, dit au modèle plutôt que subi.
   *
   * Le modèle n'écrit pas de durée — elle est mesurée après coup par la voix
   * off — donc on lui parle en caractères, au débit de `docs/providers.md`.
   * Wan ne descend pas sous 81 images : une scène animée de trois secondes
   * reçoit un clip de 5,06 s dont on ne montre que la moitié. Le mouvement
   * généré au-delà de la scène est payé et jeté.
   *
   * C'est une contrainte **sur les scènes animées seulement**, plus serrée que
   * le rythme du registre : une scène fixe reste libre de faire une ligne
   * courte, et c'est même là qu'il faut la mettre.
   */
  `- A \`video\` scene needs at least ${planchAnimeEnCaracteres()} characters` +
    ' of narration. The animation model cannot render a shorter clip, so a' +
    ' short moving scene pays for motion nobody sees. If a line is shorter' +
    ' than that, it is an `image` scene — which is also cheaper.',
  '- Do NOT write any duration. The duration of a scene is the real length of',
  '  its voice-over, measured after the audio is generated.',
  '- Do not restate the project style in each prompt: it is applied separately.',
  '- You do NOT choose visual effects. Transitions, zooms, overlays, accents:',
  '  the renderer decides all of them, from two words you write instead.',
  '- `registre` is written ONCE, at the top level of the object, and holds for',
  '  the whole video. It says what kind of video this is:',
  ...lignesDesRegistres(),
  '- `ton` is written on EACH scene and says what the sentence does, not what',
  '  it says. Exactly one of:',
  '    `pose` — the line moves forward without relief. The default, and most',
  '      scenes are this. When unsure, write `pose`.',
  '    `appui` — the line carries the point of the video. One or two per video',
  '      at the very most; a video where everything is stressed stresses',
  '      nothing.',
  '    `bascule` — the line leaves the previous subject for another one. It is',
  '      a cut, not an emphasis: use it where a chapter would start.',
  '- `counter` is optional and turns the scene into a number that climbs:',
  '  { value, label, from?, prefix?, suffix?, decimals?, variant: count|ring|wheel }.',
  '  Such a scene needs NO `prompt` — it draws itself, so it costs nothing to',
  '  illustrate. Use it whenever the narration states a figure worth holding.',
  '- `chart` is optional and turns the scene into a small graph:',
  '  { kind: bar|line, points: [{label, value}] (2 to 6), title?, max?,',
  '  prefix?, suffix?, decimals? }. `bar` compares quantities, `line` shows a',
  '  change over time, and `points` are read in the order you write them —',
  '  chronological for a line. Keep each `label` to one or two words: it is an',
  '  axis tick, and half our videos are vertical. Like `counter`, such a scene',
  '  needs NO `prompt`: it draws itself and costs nothing to illustrate. Use it',
  '  when the narration compares figures instead of stating one.',
  '- `thread` is optional and plays a short conversation:',
  '  { messages: [{from, text, mine?}] (2 to 5), title?, stepSeconds? }. The',
  '  messages appear in the order you write them, one after another; `mine`',
  '  puts a reply on the other side so it reads as an exchange, and `typing`',
  '  replaces one bubble with the three dots that mean someone is writing —',
  '  use it on the message just before the one that lands. Keep each',
  '  `text` under about fifteen words — a bubble nobody can read in three',
  '  seconds is wasted. Like `counter` and `chart`, such a scene needs NO',
  '  `prompt`. Use it when the narration quotes what people said.',
  '- `quote` is optional and puts a sentence on screen with its source:',
  '  { text, author?, role?, variant: mark|rule|plain }. Keep the three apart —',
  '  never fold the name into the sentence. Use it when the narration quotes',
  '  someone worth naming. Like the others above, such a scene needs NO',
  '  `prompt`.',
  '- `list` is optional and puts the points on screen one by one:',
  '  { items: [{text, value?}] (2 to 6), title?, label?, layout?, ordered?,',
  '  stepSeconds? }.',
  '  `value` is the figure or short label pinned to the right of a line.',
  '  `layout` only changes how the lines are arranged, never what they carry:',
  '  column (default) | rail | strip | ring | hub | splay | checklist |',
  '  ticker | timeline. Use `strip` for a row of names, `ring` or `hub` for',
  '  things orbiting one idea, `checklist` for a to-do, `ticker` for a news',
  '  ribbon, `timeline` for steps in order. `label` is a short chip before',
  '  the title, like the DIRECT of a news banner.',
  '  Set `ordered` when the order is a ranking. Keep each `text` to a few',
  '  words — the voice reads the sentence, the screen carries the point.',
  '- `comparison` is optional and faces two sides off:',
  '  { left: {label, items}, right: {label, items}, title?, stepSeconds? }.',
  '  One to four lines each; the right side carries the accent, so put there',
  '  what the viewer should leave with. Use it for before/after, us/them,',
  '  old price/new price.',
  '  Both of these draw themselves, so such a scene needs NO `prompt`.',
  '- `lowerThird` is optional and names who or what is on screen:',
  '  { name, role?, variant?, side?: left|right, holdSeconds? }.',
  '  `variant` picks the look: bar|stack|boxed|bild|clean-bar|soft-pill|',
  '  color-block|bold-block|accent-underline|kicker-name|mask-reveal|',
  '  neon-border|stack-bars. They differ only in appearance, never in what',
  '  they carry — pick one that suits the tone, not the content.',
  '  `name` is the strong line, `role` the smaller one under it — a job, a',
  '  date, a source. Keep them apart; never fold them into one string. Use it',
  '  when the narration introduces someone or cites where a fact comes from,',
  '  at most twice in a video. It sits ON the shot, so the scene keeps its',
  '  `prompt`.',
  '- `socialCard` is optional and puts a social post or notification on the',
  '  shot: { network: x|instagram|tiktok|youtube|reddit|spotify|system,',
  '  title, subtitle?, body?, action?, side?: left|right, holdSeconds? }.',
  '  `title` is the strong line — an account name, a track, a post title —',
  '  and `subtitle` the smaller one under it. `body` is the message itself.',
  '  Keep them apart; never fold two of them into one string. It sits ON the',
  '  shot, so the scene keeps its `prompt`. At most once in a video.',
  '- `callToAction` is optional and closes the video on what to do next:',
  '  { headline, buttonText?, subtext?, rating?, variant? }.',
  '  `variant` is lockup (default) | close | badges | logo | stamp — stamp',
  '  opens a video, the others close it. `rating` is a number from 0 to 5 and',
  '  draws stars. It draws itself, so such a scene needs NO `prompt`. Use it',
  '  once, on the last scene.',
  '- `sounds` is optional and may ONLY contain `src` values copied verbatim',
  '  from the sound library given below. Never invent a path.',
  `- Never return more than ${MAX_SHOTS} scenes.`,
].join('\n');
