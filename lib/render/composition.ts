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
 * Génère l'`index.html` que HyperFrames rend.
 *
 * **Pourquoi générer plutôt que templater.** Une composition GenTube n'a pas
 * un nombre de scènes fixe : elle en a autant que le storyboard, chacune avec
 * sa durée mesurée, son image, sa piste audio et ses timings mot à mot. Les
 * modèles livrés avec HyperFrames substituent des marqueurs dans un HTML
 * statique — ça marche pour trois scènes connues d'avance, pas pour N.
 *
 * **Pourquoi pas construire le DOM en JavaScript dans la page.** Le moteur lit
 * les `data-start` et `data-duration` **du DOM**, et rien ne garantit qu'il
 * rescanne après qu'un script ait ajouté des éléments. Le HTML sort d'ici déjà
 * complet : le moteur trouve la timeline entière au chargement.
 *
 * **La règle qui gouverne tout le reste** : le moteur **cherche chaque image**
 * (`seek`) au lieu de jouer la vidéo. Une animation qui accumule du temps
 * marche dans l'aperçu et se casse au rendu. Toutes les animations d'ici sont
 * des `fromTo` posés à un instant absolu — la seule forme qui survit à un saut
 * arrière.
 */

/**
 * Le projet HyperFrames : `hyperframes.json`, `style.css` et `vendor/gsap`.
 * Un rendu recopie ce dossier dans un répertoire temporaire, y dépose les
 * médias et l'`index.html` généré, puis le jette.
 */
export const COMPOSITION_DIR = 'render/gentube-v1';

/** Taille de police des sous-titres, en fraction de la hauteur de trame. */
const SUBTITLE_HEIGHT_RATIO = 0.058;
const WATERMARK_HEIGHT_RATIO = 0.032;

/** Amplitude du zoom lent sur une image fixe. 6 % sur toute la scène. */
const KEN_BURNS_SCALE = 1.06;

/** Le rouge de la marque, repris par les shaders pour leurs lueurs. */
const ACCENT_COLOR = '#ce1f20';

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

export type CompositionInput = {
  storyboard: HyperframesStoryboard;
  /** Pose la marque GenTube. Décidé au débit, pas ici. */
  watermark?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Échappe une chaîne pour l'intérieur d'un littéral JavaScript entre
 * apostrophes doubles. `JSON.stringify` fait le travail, sauf pour `</script`
 * qui fermerait la balise depuis l'intérieur d'une chaîne — un titre de vidéo
 * est du texte fourni par l'utilisateur.
 */
function js(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

/** Arrondi à la milliseconde, comme le reste du contrat de rendu. */
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

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
    const composited =
      transition === 'none' || (transition && isMoveTransition(transition))
        ? 0
        : duration;

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
function sceneMarkup(
  scene: HyperframesScene,
  index: number,
  {
    subtitles,
    trackIndex,
    subtitleStyle,
  }: { subtitles: boolean; trackIndex: number; subtitleStyle: SubtitleStyle }
): string {
  const words = subtitles ? wordsOrFallback(scene) : [];

  const captions =
    words.length > 0
      ? `<div class="captions captions-${subtitleStyle}" id="c${index}" data-layout-allow-overlap>${words
          .map(
            (word, wordIndex) =>
              `<span class="word" id="w${index}-${wordIndex}">${escapeHtml(
                word.text
              )}</span>`
          )
          .join('')}</div>`
      : '';

  // Une carte n'a pas d'image : c'est un écran noir avec du texte.
  //
  // Le chemin traverse deux couches d'échappement — CSS puis attribut HTML —
  // et `encodeURI` règle la première : il neutralise les guillemets et les
  // espaces sans toucher aux séparateurs de chemin.
  const media = mediaMarkup(scene, index);

  // Le texte d'une carte remplace le média, il ne s'y superpose pas.
  const card = scene.card
    ? `<div class="card">` +
      `<p class="card-text">${escapeHtml(scene.card.text)}</p>` +
      (scene.card.subtext
        ? `<p class="card-subtext">${escapeHtml(scene.card.subtext)}</p>`
        : '') +
      '</div>'
    : '';

  // Un bandeau posé sur l'image, distinct des sous-titres : il ne suit pas la
  // voix, il annonce ou commente.
  const overlay = scene.overlayText
    ? `<div class="overlay" id="o${index}">${escapeHtml(
        scene.overlayText.text
      )}</div>`
    : '';

  // Le titre cinétique s'anime mot à mot ; chaque mot est donc un élément,
  // comme pour le karaoké.
  const kinetic = kineticMarkup(scene, index);

  // Un éclair est une nappe de couleur pleine trame. Elle est dans la scène
  // pour disparaître avec elle, jamais au-dessus du reste de la vidéo.
  const flash = scene.effects?.flash
    ? `<div class="flash" id="f${index}" style="background:${escapeHtml(
        scene.effects.flash.color ?? '#ffffff'
      )}"></div>`
    : '';

  // La piste vient de `trackPlan` : la 0 porte le fond, et `hyperframes check`
  // refuse deux clips qui se chevauchent sur la même piste — or le fond couvre
  // toute la vidéo, il chevauche donc forcément la première scène.
  return [
    `<div class="scene clip" id="s${index}" data-start="${scene.startInSeconds}" ` +
      `data-duration="${scene.durationInSeconds}" data-track-index="${trackIndex}">`,
    media,
    card,
    captions ? '<div class="veil"></div>' : '',
    captions,
    overlay,
    kinetic,
    flash,
    '</div>',
  ]
    .filter(Boolean)
    .join('\n      ');
}

/**
 * Le média d'une scène : une image de fond, ou une balise vidéo.
 *
 * Les deux portent le même id `m<index>` — c'est lui que le zoom anime, et
 * c'est par lui que le moteur découvre un élément média. Un plan animé garde
 * donc exactement le même traitement caméra qu'une fixe.
 *
 * `data-volume` par défaut à 0 : un clip généré arrive avec sa propre bande
 * son, et la laisser passer sous la voix off produit deux audios qui se
 * marchent dessus. Une scène qui veut ce son le demande par `mediaVolume`.
 */
function mediaMarkup(scene: HyperframesScene, index: number): string {
  // Un plan animé n'a pas son média ici : une balise vidéo minutée imbriquée
  // dans une scène minutée sort **gelée** au rendu, le moteur ne sachant pas
  // laquelle des deux horloges commande. `hyperframes check` le refuse, et il
  // a raison. Les clips sont donc posés au niveau de la scène-mère par
  // `videoMarkup`, avec leur propre piste.
  if (!scene.mediaPath || isVideoPath(scene.mediaPath)) return '';

  const source = escapeHtml(encodeURI(scene.mediaPath));
  return `<div class="media" id="m${index}" style="background-image:url(&quot;${source}&quot;)"></div>`;
}

/**
 * Le clip d'un plan animé, posé au niveau de la scène-mère.
 *
 * Il porte `clip` pour rester invisible avant son instant, et son volume est
 * nul par défaut : un clip généré arrive avec sa propre bande son, et la
 * laisser passer sous la voix off produit deux audios qui se marchent dessus.
 */
function videoMarkup(
  scene: HyperframesScene,
  index: number,
  trackIndex: number
): string {
  if (!scene.mediaPath || !isVideoPath(scene.mediaPath)) return '';

  const volume = scene.mediaVolume ?? 0;
  const rate = scene.playbackRate ?? 1;

  return (
    `<video class="media clip" id="m${index}" src="${escapeHtml(
      encodeURI(scene.mediaPath)
    )}" data-start="${scene.startInSeconds}" ` +
    `data-duration="${scene.durationInSeconds}" data-track-index="${trackIndex}" ` +
    `data-volume="${volume}" data-playback-rate="${rate}" ` +
    `preload="auto" playsinline${volume === 0 ? ' muted' : ''}></video>`
  );
}

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
 * Le titre cinétique, un élément par mot.
 *
 * La variante décide de l'apparence en CSS ; le décalage entre les mots est
 * une donnée de timeline, calculée ici pour que la page n'ait aucun calcul de
 * temps à faire.
 */
function kineticMarkup(scene: HyperframesScene, index: number): string {
  const title = scene.kineticTitle;
  if (!title) return '';

  const words = title.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const style = [
    title.fontSize ? `font-size:${escapeHtml(title.fontSize)}` : '',
    title.highlightColor ? `--kt-accent:${escapeHtml(title.highlightColor)}` : '',
    title.glowColor ? `--kt-glow:${escapeHtml(title.glowColor)}` : '',
  ]
    .filter(Boolean)
    .join(';');

  const icon =
    title.variant === 'icon' && title.icon
      ? `<span class="kt-icon" aria-hidden="true">${escapeHtml(title.icon)}</span>` +
        (title.iconLabel
          ? `<span class="kt-icon-label">${escapeHtml(title.iconLabel)}</span>`
          : '')
      : '';

  return (
    `<div class="kinetic kt-${escapeHtml(title.variant ?? 'reveal')} ` +
    `kt-${escapeHtml(title.position ?? 'center')}"${style ? ` style="${style}"` : ''}>` +
    icon +
    words
      .map(
        (word, wordIndex) =>
          `<span class="kt-word" id="k${index}-${wordIndex}">${escapeHtml(word)}</span>`
      )
      .join('') +
    '</div>'
  );
}

/**
 * La piste de voix d'une scène.
 *
 * Sa durée est `narrationSeconds`, pas `durationInSeconds` : l'image reste à
 * l'écran après la fin de la phrase, la voix non. Confondre les deux fait
 * jouer la voix d'une scène par-dessus la suivante.
 */
function audioMarkup(
  scene: HyperframesScene,
  index: number,
  trackBase: number
): string {
  if (!scene.audioPath) return '';
  // L'`id` n'est pas cosmétique : le moteur découvre les éléments média par
  // leur id. Sans lui, la piste est ignorée et la vidéo sort **muette**, sans
  // qu'aucune erreur ne soit levée.
  return (
    `<audio id="voice-${index}" src="${escapeHtml(scene.audioPath)}" ` +
    `data-start="${scene.startInSeconds}" data-duration="${scene.narrationSeconds}" ` +
    `data-track-index="${trackBase + index}" data-volume="1"></audio>`
  );
}

/**
 * **Aucun accent grave dans le HTML ci-dessous, commentaires compris.** Tout ce
 * qui suit vit dans un littéral de gabarit : un accent grave le referme, et
 * TypeScript rapporte alors une erreur de syntaxe à une ligne qui n'a rien à
 * voir. Trois fois le même piège le 1er septembre 2026.
 */
export function composeHtml({
  storyboard,
  watermark = false,
}: CompositionInput): string {
  const { width, height, durationInSeconds, scenes } = storyboard;

  // Les clips prennent des pistes en plus des scènes : la base audio se calcule
  // sur le plan réel, pas sur le nombre de scènes.
  const subtitleStyle = subtitleStyleOf(storyboard);
  const tracks = trackPlan(scenes);
  const topTrack = tracks.reduce((high, t) => Math.max(high, t.scene), 0);
  const audioTrackBase = topTrack + 10;

  const subtitleSize = Math.round(height * SUBTITLE_HEIGHT_RATIO);
  const watermarkSize = Math.round(height * WATERMARK_HEIGHT_RATIO);

  const music = storyboard.music
    ? `<audio id="music" src="${escapeHtml(storyboard.music)}" data-start="0" ` +
      `data-duration="${durationInSeconds}" data-track-index="${audioTrackBase - 1}" ` +
      `data-volume="${storyboard.musicVolume}" loop></audio>`
    : '';

  const watermarkMarkup = watermark
    ? `<div class="watermark clip" id="watermark" data-start="0" ` +
      `data-duration="${durationInSeconds}" ` +
      `data-track-index="${audioTrackBase - 2}">` +
      `<span class="dot" style="width:${Math.round(watermarkSize * 0.5)}px;` +
      `height:${Math.round(watermarkSize * 0.5)}px"></span>GenTube</div>`
    : '';

  // Le script embarque exactement ce dont il a besoin : des instants absolus
  // et des cibles. Aucun calcul de temps ne se fait dans la page.
  const timeline = {
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
        flash: flash
          ? {
              at: ms(scene.startInSeconds + (flash.startInSeconds ?? 0)),
              duration: flash.durationInSeconds ?? 0.18,
            }
          : null,
        overlay: scene.overlayText
          ? { at: ms(scene.startInSeconds + (scene.overlayText.startInSeconds ?? 0)) }
          : null,
        kinetic: title
          ? {
              at: ms(scene.startInSeconds + (title.startInSeconds ?? 0)),
              duration: title.animationDuration ?? 0.5,
              stagger: title.staggerDelay ?? 0.08,
              count: title.text.trim().split(/\s+/).filter(Boolean).length,
            }
          : null,
        words: (storyboard.subtitles ? wordsOrFallback(scene) : []).map(
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
    cuts: transitionCues(scenes),
    accent: ACCENT_COLOR,
    subtitleStyle,
  };

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${escapeHtml(storyboard.title)}</title>
    <script>
      /*
       * Le compositeur de shaders vit dans la page, pas dans le moteur.
       *
       * Le rendu distribué — celui de Lambda — câble 'usePageSideCompositing'
       * à false en dur (@hyperframes/producer/dist/distributed.js) et
       * n'injecte donc jamais ce drapeau. Mais il ne contrôle que ce que fait
       * le producer : rien n'empêche la page de se déclarer elle-même.
       *
       * Posé avant le bundle, parce que c'est à son chargement qu'il le lit.
       */
      window.__HF_PAGE_SIDE_COMPOSITING__ = true;
    </script>
    <script src="vendor/gsap.min.js"></script>
    <script src="vendor/shader-transitions.min.js"></script>
    <link rel="stylesheet" href="style.css" />
    <style>
      html, body { width: ${width}px; height: ${height}px; }
      .captions { font-size: ${subtitleSize}px; }
      .watermark { font-size: ${watermarkSize}px; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${durationInSeconds}"
      data-width="${width}"
      data-height="${height}"
    >
      <div id="bg" class="clip" data-start="0" data-duration="${durationInSeconds}" data-track-index="0"></div>
      ${scenes
        .map((scene, index) =>
          [
            videoMarkup(scene, index, tracks[index].video ?? 0),
            sceneMarkup(scene, index, {
              subtitles: storyboard.subtitles,
              trackIndex: tracks[index].scene,
              subtitleStyle,
            }),
          ]
            .filter(Boolean)
            .join('\n      ')
        )
        .join('\n      ')}
      <div id="blackout"></div>
      ${watermarkMarkup}
      ${scenes
        .map((scene, index) => audioMarkup(scene, index, audioTrackBase))
        .filter(Boolean)
        .join('\n      ')}
      ${music}
    </div>

    <script>
      // Tout en fromTo, jamais en to : c'est la seule forme qui survit à un
      // seek arrière, donc la seule sûre quand le moteur cherche chaque image
      // au lieu de jouer.
      const T = ${js(timeline)};
      const tl = gsap.timeline({ paused: true });

      for (const scene of T.scenes) {
        if (scene.fade > 0) {
          tl.fromTo(
            "#s" + scene.index,
            { opacity: 0 },
            { opacity: 1, duration: scene.fade, ease: "power2.inOut" },
            scene.start
          );

          if (scene.hoisted) {
            tl.fromTo(
              "#m" + scene.index,
              { opacity: 0 },
              { opacity: 1, duration: scene.fade, ease: "power2.inOut" },
              scene.start
            );
          }
        }

        if (scene.hasMedia && scene.zoom) {
          tl.fromTo(
            "#m" + scene.index,
            { scale: scene.zoom.from },
            { scale: scene.zoom.to, duration: scene.duration, ease: "none" },
            scene.start
          );
        }

        // Un clip lu à une autre vitesse que la sienne : posé sur
        // l'élément, pas sur la timeline, le moteur cherche chaque image.
        if (scene.rate && scene.rate !== 1) {
          const clip = document.getElementById("m" + scene.index);
          if (clip) clip.playbackRate = scene.rate;
        }

        // Le tremblement : une secousse courte et répétée, jamais une dérive.
        // Le yoyo revient toujours à zéro, donc un saut arrière retombe juste.
        if (scene.shake) {
          tl.fromTo(
            "#m" + scene.index,
            { x: -6, y: 3 },
            {
              x: 6,
              y: -3,
              duration: 0.06,
              ease: "none",
              repeat: Math.round(scene.duration / 0.06),
              yoyo: true,
            },
            scene.start
          );
        }

        // L'éclair : une nappe pleine trame qui monte vite et retombe.
        if (scene.flash) {
          tl.fromTo(
            "#f" + scene.index,
            { opacity: 0 },
            {
              opacity: 0.9,
              duration: scene.flash.duration / 2,
              ease: "power2.out",
              repeat: 1,
              yoyo: true,
            },
            scene.flash.at
          );
        }

        if (scene.overlay) {
          tl.fromTo(
            "#o" + scene.index,
            { opacity: 0, y: 18 },
            { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" },
            scene.overlay.at
          );
        }

        // Le titre cinétique : chaque mot entre à son tour. Le décalage est
        // une donnée, calculée hors de la page.
        if (scene.kinetic) {
          for (let w = 0; w < scene.kinetic.count; w++) {
            tl.fromTo(
              "#k" + scene.index + "-" + w,
              { opacity: 0, y: 26, scale: 0.92 },
              {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: scene.kinetic.duration,
                ease: "back.out(1.7)",
              },
              scene.kinetic.at + w * scene.kinetic.stagger
            );
          }
        }

        // Trois styles, trois façons de faire apparaître la phrase.
        //
        //  - karaoke  : le mot s'allume à son instant et le reste. Une durée
        //               nulle serait ignorée par GSAP, d'où le millième.
        //  - fondant  : le mot monte et se révèle, sans changer de couleur.
        //               Pas de flou CSS — la rastérisation logicielle
        //               de Lambda le paie cher (voir l'en-tête de style.css).
        //  - cinematic: aucun mot ne bouge. La phrase entière apparaît avec la
        //               scène, comme un sous-titre de film.
        if (T.subtitleStyle === "cinematic") {
          if (scene.words.length > 0) {
            tl.fromTo(
              "#c" + scene.index,
              { opacity: 0 },
              { opacity: 1, duration: 0.3, ease: "power2.out" },
              scene.start
            );
          }
        } else if (T.subtitleStyle === "fondant") {
          scene.words.forEach(function (word, i) {
            tl.fromTo(
              "#w" + scene.index + "-" + i,
              { opacity: 0.25, y: "0.22em" },
              { opacity: 1, y: "0em", duration: 0.28, ease: "power2.out" },
              word.at
            );
          });
        } else {
          scene.words.forEach(function (word, i) {
            tl.fromTo(
              "#w" + scene.index + "-" + i,
              { color: "rgba(255,255,255,0.42)" },
              { color: "#ffffff", duration: 0.001, ease: "none" },
              word.at
            );
          });
        }
      }

      /*
       * Les transitions par transformation.
       *
       * Chaque geste est une paire : ce que fait la scène sortante, ce que fait
       * l'entrante. Tout est en pourcentage ou en échelle, donc indépendant de
       * la résolution — la même poussée marche en 480p et en 720p.
       *
       * Les deux tweens sont des fromTo posés au même instant, comme le reste
       * du fichier : le moteur cherche chaque image, un to ne survivrait pas au
       * saut arriere.
       */
      const MOVES = {
        "push-left":    { out: { x: "-100%" }, in: { x: "100%" } },
        "push-right":   { out: { x: "100%" },  in: { x: "-100%" } },
        "push-up":      { out: { y: "-100%" }, in: { y: "100%" } },
        "zoom-through": { out: { scale: 1.6, opacity: 0 }, in: { scale: 0.72 } },
        "zoom-out":     { out: { scale: 0.62, opacity: 0 }, in: { scale: 1.45 } },
        "squeeze":      { out: { scaleX: 0, opacity: 0 },   in: { scaleX: 0 } },
      };

      for (const move of T.moves) {
        const shape = MOVES[move.kind];
        if (!shape) continue;

        const rest = { x: "0%", y: "0%", scale: 1, scaleX: 1, opacity: 1 };
        const ease = move.kind === "squeeze" ? "power2.inOut" : "power3.inOut";

        // La sortante part de sa position de repos vers l'ailleurs du geste.
        tl.fromTo(
          "#s" + move.from,
          { x: "0%", y: "0%", scale: 1, scaleX: 1, opacity: 1 },
          Object.assign({ duration: move.duration, ease: ease }, shape.out),
          move.at
        );

        // L'entrante fait le trajet inverse et finit au repos, opaque.
        tl.fromTo(
          "#s" + move.to,
          Object.assign({ opacity: 1 }, shape.in),
          Object.assign({ duration: move.duration, ease: ease }, rest),
          move.at
        );
      }

      // Le fondu au noir : la nappe monte sur la première moitié de la
      // transition et redescend sur la seconde. C'est ce qui distingue
      // 'black' d'un fondu enchaîné — on passe par du noir franc.
      for (const cut of T.blackouts) {
        tl.fromTo(
          "#blackout",
          { opacity: 0 },
          {
            opacity: 1,
            duration: cut.duration / 2,
            ease: "power2.inOut",
            repeat: 1,
            yoyo: true,
          },
          cut.at - cut.duration / 2
        );
      }

      // Les transitions shader se posent PAR-DESSUS cette timeline. Sans le
      // paquet — ou sans WebGL — il ne se passe rien ici et le fondu déjà
      // programmé reste seul : la vidéo sort, en moins spectaculaire.
      if (typeof HyperShader !== "undefined" && HyperShader.isPageSideCompositingSupported) {
        console.log(
          "[gentube] compositing page-side supporté :",
          HyperShader.isPageSideCompositingSupported()
        );
      }

      /*
       * Le compositeur n'est installé que si la vidéo demande vraiment un
       * shader.
       *
       * init() prend la main sur la visibilité des scènes : il ne garde
       * visible que la paire de sa propre couture et cache tout le reste. Une
       * transition par transformation a besoin des deux scènes à l'écran
       * pendant qu'elles bougent — la sortante disparaissait, et la poussée ne
       * poussait rien qu'une bande noire.
       *
       * Conséquence à connaître : dans une vidéo qui contient au moins un
       * shader, les transformations retombent en coupe franche. Les deux
       * familles ne se mélangent pas.
       */
      const wantsShader = T.cuts.some(function (cut) { return !!cut.shader; });

      if (wantsShader && typeof HyperShader !== "undefined") {
        HyperShader.init({
          bgColor: "#000000",
          accentColor: T.accent,
          scenes: T.scenes.map(function (scene) { return "s" + scene.index; }),
          transitions: T.cuts,
          timeline: tl,
        });
      }

      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
