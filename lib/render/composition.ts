import type { HyperframesStoryboard } from '@/lib/storyboard/render';
import { transitionDurationSeconds } from '@/lib/storyboard/render';
import { isMoveTransition } from '@/lib/storyboard/render';
import {
  fadeInSeconds,
  isVideoPath,
  kenBurns,
  ms,
  subtitleStyleOf,
  trackPlan,
  transitionCues,
  wordsOrFallback,
} from './plan';
import { audioMarkup, escapeHtml, sceneMarkup, videoMarkup } from './markup';

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


export type CompositionInput = {
  storyboard: HyperframesStoryboard;
  /** Pose la marque GenTube. Décidé au débit, pas ici. */
  watermark?: boolean;
};

/**
 * Échappe une chaîne pour l'intérieur d'un littéral JavaScript entre
 * apostrophes doubles. `JSON.stringify` fait le travail, sauf pour `</script`
 * qui fermerait la balise depuis l'intérieur d'une chaîne — un titre de vidéo
 * est du texte fourni par l'utilisateur.
 */
function js(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

/**
 * Réexports de compatibilité.
 *
 * `composition.ts` était le seul point d'entrée avant le découpage ; les tests
 * et `preview.ts` importent encore d'ici. Plutôt que de réécrire leurs imports,
 * on les laisse passer par là.
 */
export {
  fadeInSeconds,
  isVideoPath,
  kenBurns,
  lightsWords,
  subtitleStyleOf,
  trackPlan,
  transitionCues,
  wordsOrFallback,
} from './plan';

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
      if (T.cuts.length > 0 && typeof HyperShader !== "undefined") {
        HyperShader.init({
          bgColor: "#000000",
          accentColor: T.accent,
          scenes: T.scenes.map(function (scene) { return "s" + scene.index; }),
          transitions: T.cuts,
          timeline: tl,
        });
      }

      /*
       * Les mouvements sont posés APRÈS le compositeur, volontairement.
       *
       * Le moteur cherche chaque image, et à chaque image les deux systèmes
       * écrivent sur les mêmes propriétés. Celui qui écrit en dernier gagne.
       * Posés avant, nos gestes étaient effacés par la gestion de visibilité
       * du compositeur — la scène sortante ou l'entrante disparaissait selon
       * la durée de couture.
       */
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
          { x: "0%", y: "0%", scale: 1, scaleX: 1, opacity: 1, visibility: "visible" },
          Object.assign({ duration: move.duration, ease: ease, visibility: "visible" }, shape.out),
          move.at
        );

        // L'entrante fait le trajet inverse et finit au repos, opaque.
        tl.fromTo(
          "#s" + move.to,
          Object.assign({ opacity: 1, visibility: "visible" }, shape.in),
          Object.assign({ duration: move.duration, ease: ease, visibility: "visible" }, rest),
          move.at
        );
      }


      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
