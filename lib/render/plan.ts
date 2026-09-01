import type { HyperframesScene, WordTiming } from '@/lib/storyboard/render';
import type { SubtitleStyle } from '@/lib/db/schema';
import {
  isMoveTransition,
  isShaderTransition,
  transitionDurationSeconds,
} from '@/lib/storyboard/render';

/**
 * Ce que la composition calcule avant d'écrire quoi que ce soit : le style de
 * sous-titre effectif, les pistes, les coutures, le zoom, le fondu, et les mots
 * quand l'alignement manque.
 *
 * Séparé du balisage parce que ce sont deux métiers. Ici on décide, là-bas on
 * dessine — et seul ce fichier se teste sans lire une chaîne de HTML.
 */

/** Amplitude du zoom lent sur une image fixe. 6 % sur toute la scène. */
const KEN_BURNS_SCALE = 1.06;

/** Arrondi à la milliseconde, comme le reste du contrat de rendu. */
export const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * Le style de sous-titre d'une vidéo, avec son repli.
 *
 * Trois valeurs vivent dans `videos.subtitle_style` depuis l'origine, et la
 * composition n'en lisait aucune : toute vidéo sortait en karaoké, y compris
 * celles qui avaient choisi autre chose. Le repli reste le karaoké parce que
 * c'est ce que les vidéos déjà rendues ont eu.
 */
export function subtitleStyleOf(storyboard: {
  subtitleStyle?: SubtitleStyle | null;
}): SubtitleStyle {
  return storyboard.subtitleStyle ?? 'karaoke';
}

/** Vrai quand le style allume les mots un par un. */
export function lightsWords(style: SubtitleStyle): boolean {
  return style !== 'cinematic';
}
/**
 * Un plan animé est un fichier vidéo, pas une image.
 *
 * La distinction se lit sur l'extension plutôt que sur `shot.type` : la
 * composition ne connaît que le storyboard aplati, et un chemin dit déjà tout
 * ce qu'il faut. Un `.mp4` posé en `background-image` ne rendrait rien du
 * tout — pas d'erreur, juste un cadre noir.
 */
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

export function isVideoPath(path?: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Les coutures entre scènes, telles que `HyperShader.init` les attend.
 *
 * **Une par intervalle, pas une par shader.** Le paquet exige exactement
 * `scènes - 1` entrées et refuse d'y déroger : il compose la vidéo entière,
 * pas seulement les endroits spectaculaires. Une couture sans `shader` est un
 * fondu enchaîné CSS — c'est ainsi qu'on déclare `fade`, `black` et `none`.
 */
export function transitionCues(
  scenes: HyperframesScene[]
): { time: number; shader?: string; duration: number }[] {
  return scenes.slice(1).map((scene) => {
    const transition = scene.effects?.transition;
    const duration = transitionDurationSeconds(transition);

    // Une couture sans `shader` est un fondu enchaîné côté compositeur. Pour
    // une transformation il faut lui dire de ne rien faire — durée nulle, donc
    // coupe franche — sinon il mélange les deux scènes pendant qu'elles se
    // déplacent, et le mouvement disparaît sous le fondu.
    const composited = transition === 'none' ? 0 : duration;

    return {
      time: ms(scene.startInSeconds),
      duration: composited,
      ...(transition && isShaderTransition(transition)
        ? { shader: transition }
        : {}),
    };
  });
}

/**
 * Le zoom d'une scène, sous forme d'échelles de départ et d'arrivée.
 *
 * `none` ne rend pas une image parfaitement immobile : un plan fixe absolu au
 * milieu de plans animés se lit comme une image figée, pas comme un choix. Il
 * garde donc une dérive minuscule.
 */
export function kenBurns(zoom?: string): { from: number; to: number } {
  if (zoom === 'out') return { from: KEN_BURNS_SCALE, to: 1 };
  if (zoom === 'none') return { from: 1, to: 1.01 };
  return { from: 1, to: KEN_BURNS_SCALE };
}

/**
 * Le fondu d'entrée d'une scène.
 *
 * `sceneStartTimes()` a déjà reculé chaque scène de la durée de sa propre
 * transition, donc les scènes se chevauchent : il suffit de faire monter
 * l'opacité de celle qui arrive pour obtenir un fondu enchaîné.
 *
 * La première scène ne reçoit aucun fondu — elle ouvre la vidéo, il n'y a
 * rien sous elle. Une coupe franche (`none`) non plus.
 *
 * Seules les transitions CSS sont rendues ici. Les 14 transitions shader de
 * `@hyperframes/shader-transitions` demandent le paquet et un canvas WebGL :
 * elles tomberont sur un fondu tant qu'il n'est pas installé, plutôt que de
 * faire échouer un rendu.
 */
export function fadeInSeconds(scene: HyperframesScene, index: number): number {
  if (index === 0) return 0;
  const transition = scene.effects?.transition;
  if (transition === 'none') return 0;
  // Une transition par transformation ne se fond pas : la scène entrante est
  // opaque et arrive par le bord. Un fondu par-dessus la ferait apparaître
  // fantomatique pendant tout son trajet.
  if (transition && isMoveTransition(transition)) return 0;
  return transitionDurationSeconds(transition);
}

/**
 * Découpe la narration en mots quand la voix off n'a pas fourni d'alignement.
 *
 * Sans timings, on ne peut pas allumer les mots un par un — mais afficher le
 * texte vaut mieux que ne rien afficher, donc chaque mot reçoit une part égale
 * de la narration. C'est visiblement moins bon, et c'est le but : on doit voir
 * qu'un alignement manque.
 */
export function wordsOrFallback(
  scene: HyperframesScene
): WordTiming[] {
  if (scene.words && scene.words.length > 0) return scene.words;

  const spoken = (scene.subtitle ?? scene.narration ?? '').trim();
  if (!spoken) return [];

  const parts = spoken.split(/\s+/);
  const each = scene.narrationSeconds / parts.length;
  return parts.map((text, index) => ({
    text,
    start: ms(index * each),
    duration: ms(each),
  }));
}

/*
 * `data-layout-allow-overlap` sur les sous-titres : pendant un fondu enchaîné,
 * les mots de la scène sortante et ceux de la scène entrante occupent la même
 * bande. C'est ce qu'un fondu fait, et les deux sont à demi transparents à cet
 * instant. Sans cette marque, `hyperframes check` le signale à chaque couture.
 */
/**
 * Les pistes, attribuées d'un seul passage.
 *
 * La 0 porte le fond. Ensuite chaque scène prend la sienne, et un plan animé
 * en prend une de plus, **juste en dessous** : le clip doit rester sous les
 * sous-titres et le bandeau de sa propre scène, qui vivent dans le div.
 *
 * Le compteur avance scène par scène plutôt que par une formule, pour qu'une
 * composition sans clip garde exactement la numérotation d'avant.
 */
export function trackPlan(
  scenes: HyperframesScene[]
): { scene: number; video: number | null }[] {
  let next = 1;
  return scenes.map((scene) => {
    const video = isVideoPath(scene.mediaPath) ? next++ : null;
    return { video, scene: next++ };
  });
}
