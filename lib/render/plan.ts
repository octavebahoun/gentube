import type {
  HyperframesScene,
  HyperframesStoryboard,
  WordTiming,
} from '@/lib/storyboard/render';
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

/** Le rouge de la marque, repris par les shaders pour leurs lueurs. */
const ACCENT_COLOR = '#ce1f20';

/**
 * Combien de sons une scène peut poser.
 *
 * Réexporté du contrat, qui borne aussi le tableau à l'entrée : réserver une
 * largeur de bande sans la faire respecter laissait un neuvième son écrire sur
 * la bande de la scène suivante.
 */
export { MAX_SOUNDS_PER_SCENE } from '@/lib/storyboard/render';

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

    // Une couture sans `shader` est un fondu enchaîné côté compositeur, et
    // c'est ce qu'on veut même pour une transformation : sa durée réelle est
    // ce qui garde les deux scènes vivantes pendant le geste. Seule `none`
    // coupe franc.
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

/**
 * Les données que la page recevra, calculées ici et jamais dans le navigateur.
 *
 * Tout y est en instants absolus : le moteur cherche chaque image, il ne joue
 * pas la vidéo. Un calcul de temps fait dans la page dériverait d'un rendu à
 * l'autre.
 */
export function buildTimeline(
  storyboard: HyperframesStoryboard,
  subtitleStyle: SubtitleStyle
) {
  const scenes = storyboard.scenes;
  // Calculés une fois pour toute la vidéo : chaque scène qui demande le rythme
  // y pioche, plutôt que de reconstruire la liste des pics.
  const beats = musicBeats(storyboard);
  return {
    scenes: scenes.map((scene, index) => {
      const title = scene.kineticTitle;
      const flash = scene.effects?.flash;

      return {
        index,
        start: scene.startInSeconds,
        duration: scene.durationInSeconds,
        fade: fadeInSeconds(scene, index),
        hasMedia: Boolean(scene.mediaPath),
        // Le clip vit hors du div de la scène : le fondu de la scène ne
        // l'emporte plus avec lui, il faut le lui appliquer aussi.
        hoisted: isVideoPath(scene.mediaPath),
        // Un clip porte déjà son propre mouvement : lui ajouter un Ken Burns
        // superpose deux caméras et donne le mal de mer.
        zoom: isVideoPath(scene.mediaPath)
          ? null
          : kenBurns(scene.effects?.zoom),
        rate: isVideoPath(scene.mediaPath) ? (scene.playbackRate ?? 1) : null,
        shake: scene.effects?.shake === true,
        // Un tremblement calé démarre sur la frappe plutôt qu'avec la scène.
        shakeAt: scene.effects?.shake
          ? onBeat(scene, beats, scene.startInSeconds)
          : null,
        flash: flash
          ? {
              at: onBeat(scene, beats, scene.startInSeconds + (flash.startInSeconds ?? 0)),
              duration: flash.durationInSeconds ?? 0.18,
            }
          : null,
        overlay: scene.overlayText
          ? { at: ms(scene.startInSeconds + (scene.overlayText.startInSeconds ?? 0)) }
          : null,
        counter: scene.counter
          ? {
              at: ms(scene.startInSeconds + (scene.counter.startInSeconds ?? 0)),
              duration: scene.counter.durationInSeconds ?? 1.4,
              from: scene.counter.from ?? 0,
              to: scene.counter.value,
              decimals: scene.counter.decimals ?? 0,
              prefix: scene.counter.prefix ?? '',
              suffix: scene.counter.suffix ?? '',
              ring: scene.counter.variant === 'ring',
            }
          : null,
        kinetic: title
          ? {
              at: ms(scene.startInSeconds + (title.startInSeconds ?? 0)),
              duration: title.animationDuration ?? 0.5,
              stagger: title.staggerDelay ?? 0.08,
              variant: title.variant ?? 'reveal',
              /**
               * Les identifiants à animer, dans l'ordre d'apparition.
               *
               * Calculés ici parce que trois variantes animent la lettre et
               * les autres le mot : la page ne doit pas avoir à redécouper le
               * titre pour savoir quoi viser.
               */
              cibles: titleTargets(title, index),
            }
          : null,
        // Même règle que le balisage : sans mots posés, un tween de karaoké
        // viserait un identifiant qui n'existe pas.
        words: ((scene.showSubtitles ?? storyboard.subtitles)
          ? wordsOrFallback(scene)
          : []
        ).map(
          (word) => ({ at: ms(scene.startInSeconds + word.start) })
        ),
      };
    }),
    /**
     * Les transitions par transformation.
     *
     * Chacune anime **deux** scènes : celle qui sort et celle qui entre. C'est
     * la seule famille qui touche à la scène précédente, d'où sa propre liste
     * plutôt qu'un champ dans `scenes` — la scène `i` n'est pas propriétaire du
     * mouvement de la scène `i-1`.
     */
    moves: scenes
      .map((scene, index) => ({ scene, index }))
      .filter(
        ({ scene, index }) =>
          index > 0 &&
          scene.effects?.transition &&
          isMoveTransition(scene.effects.transition)
      )
      .map(({ scene, index }) => ({
        kind: scene.effects!.transition as string,
        from: index - 1,
        to: index,
        at: ms(scene.startInSeconds),
        duration: transitionDurationSeconds(scene.effects!.transition),
      })),
    // Les fondus au noir : une nappe opaque qui monte et redescend sur la
    // couture. `black` n'est pas un fondu enchaîné, il passe par du noir franc.
    blackouts: scenes
      .map((scene, index) => ({ scene, index }))
      .filter(
        ({ scene, index }) => index > 0 && scene.effects?.transition === 'black'
      )
      .map(({ scene }) => ({
        at: ms(scene.startInSeconds),
        duration: transitionDurationSeconds('black'),
      })),
    /**
     * Les fondus des sons.
     *
     * Le moteur ne connaît que `data-volume`, une valeur fixe. Un son qui doit
     * monter ou retomber le fait donc par la timeline, sur la propriété
     * `volume` de l'élément — la même mécanique que le reste du fichier, et
     * elle survit au saut arrière pour la même raison.
     */
    sfx: scenes.flatMap((scene, index) =>
      (scene.sounds ?? []).flatMap((sound, n) => {
        const monte = sound.fadeInSeconds ?? 0;
        const tombe = sound.fadeOutSeconds ?? 0;
        if (monte <= 0 && tombe <= 0) return [];

        const offset = sound.startInSeconds ?? 0;
        const debut = ms(scene.startInSeconds + offset);
        const reste = Math.max(0.05, scene.durationInSeconds - offset);
        const cible = (sound.volume ?? 1) * storyboard.sfxVolume;

        return [
          {
            id: `sfx-${index}-${n}`,
            at: debut,
            fin: ms(debut + reste),
            monte,
            tombe,
            cible,
          },
        ];
      })
    ),
    cuts: transitionCues(scenes),
    accent: ACCENT_COLOR,
    subtitleStyle,
  };
}


/**
 * Tous les temps forts de la vidéo, pics du morceau répétés tant qu'il boucle.
 *
 * La musique tourne en boucle du début à la fin ; ses pics reviennent donc à
 * chaque tour. Sans cette répétition, un `onBeat` posé à la trentième seconde
 * d'une nappe de trente et une secondes ne trouverait jamais rien.
 *
 * Rendue triée, parce que `snapToBeat` s'arrête au premier écart croissant.
 */
export function musicBeats(storyboard: HyperframesStoryboard): number[] {
  const pics = storyboard.musicImpacts ?? [];
  const tour = storyboard.musicDurationS ?? 0;
  if (pics.length === 0) return [];
  if (tour <= 0) return [...pics].sort((a, b) => a - b);

  const tous: number[] = [];
  for (let debut = 0; debut < storyboard.durationInSeconds; debut += tour) {
    for (const pic of pics) {
      const instant = debut + pic;
      if (instant <= storyboard.durationInSeconds) tous.push(instant);
    }
  }
  return tous.sort((a, b) => a - b);
}

/**
 * L'instant écrit, ou le temps fort le plus proche s'il est assez près.
 *
 * La fenêtre borne le déplacement : un effet qu'on décale d'une seconde pour
 * l'accrocher à un pic ne ponctue plus ce qu'il devait ponctuer. Au-delà, on
 * garde l'instant d'origine — mieux vaut un effet hors rythme qu'un effet au
 * mauvais endroit.
 */
export function snapToBeat(
  at: number,
  beats: number[],
  fenetre = 0.35
): number {
  let meilleur = at;
  let ecart = fenetre;

  for (const beat of beats) {
    const distance = Math.abs(beat - at);
    if (distance <= ecart) {
      ecart = distance;
      meilleur = beat;
    } else if (beat > at && distance > ecart) {
      break;
    }
  }
  return ms(meilleur);
}


/** L'instant d'un effet, calé sur le rythme quand la scène le demande. */
function onBeat(
  scene: HyperframesScene,
  beats: number[],
  at: number
): number {
  return scene.effects?.onBeat ? snapToBeat(at, beats) : ms(at);
}


/**
 * Ce qu'une variante de titre anime : ses mots, ou ses lettres.
 *
 * Le découpage vit ici et pas dans la page, pour la même raison que tout le
 * reste du fichier : le moteur cherche chaque image, et un calcul fait dans le
 * navigateur dériverait d'un rendu à l'autre.
 */
export const TITRE_PAR_LETTRE = new Set(['typewriter', 'tracking', 'cascade']);

export function titleTargets(
  title: { text: string; variant?: string },
  index: number
): string[] {
  const mots = title.text.trim().split(/\s+/).filter(Boolean);
  if (!title.variant || !TITRE_PAR_LETTRE.has(title.variant)) {
    return mots.map((_, i) => `k${index}-${i}`);
  }
  return mots.flatMap((mot, i) =>
    [...mot].map((_, j) => `k${index}-${i}-${j}`)
  );
}
