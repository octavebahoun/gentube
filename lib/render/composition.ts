import type { HyperframesStoryboard } from '@/lib/storyboard/render';
import { transitionDurationSeconds } from '@/lib/storyboard/render';
import { isMoveTransition } from '@/lib/storyboard/render';
import {
  MAX_SOUNDS_PER_SCENE,
  buildTimeline,
  fadeInSeconds,
  isVideoPath,
  kenBurns,
  ms,
  subtitleStyleOf,
  trackPlan,
  transitionCues,
  wordsOrFallback,
} from './plan';
import {
  audioMarkup,
  escapeHtml,
  sceneMarkup,
  soundsMarkup,
  videoMarkup,
} from './markup';

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

/**
 * À quelle hauteur du bas les sous-titres s'arrêtent, par format.
 *
 * En 16:9 la vidéo occupe tout l'écran et 9 % suffisent à décoller le texte du
 * bord. En 9:16 elle est lue dans TikTok, Reels ou Shorts, qui posent leur
 * propre interface sur le bas du cadre — légende, boutons, nom du compte. Un
 * sous-titre à 9 % passe dessous, et ça ne se voit sur aucun rendu : seulement
 * sur la plateforme, une fois publié.
 *
 * 18 % dégage cette bande. C'est de la place perdue sur l'image, et c'est le
 * prix d'un sous-titre qu'on peut lire.
 */
const SUBTITLE_BOTTOM: Record<string, number> = {
  '16:9': 0.09,
  '9:16': 0.18,
};

/** Amplitude du zoom lent sur une image fixe. 6 % sur toute la scène. */
const KEN_BURNS_SCALE = 1.06;


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
  // Une bande par famille : le moteur refuse deux éléments qui se chevauchent
  // sur la même piste, et deux sons d'une même scène se chevauchent souvent.
  const sfxTrackBase = audioTrackBase + scenes.length + 10;

  const subtitleSize = Math.round(height * SUBTITLE_HEIGHT_RATIO);
  const watermarkSize = Math.round(height * WATERMARK_HEIGHT_RATIO);
  const subtitleBottom = (SUBTITLE_BOTTOM[storyboard.ratio] ?? 0.09) * 100;

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
  const timeline = buildTimeline(storyboard, subtitleStyle);

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
      .captions { font-size: ${subtitleSize}px; bottom: ${subtitleBottom}%; }
      .veil {
        --veil-start: ${Math.round(100 - subtitleBottom - 36)}%;
        --veil-mid: ${Math.round(100 - subtitleBottom - 3)}%;
      }
      /* Même raison que les sous-titres : un filigrane couvert par l'interface
         de la plateforme ne défend plus la marque. */
      .watermark { bottom: ${(subtitleBottom / 9) * 3.5}%; }
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
      ${scenes
        .map((scene, index) =>
          soundsMarkup(scene, index, {
            trackBase: sfxTrackBase + index * MAX_SOUNDS_PER_SCENE,
            sfxVolume: storyboard.sfxVolume,
          })
        )
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

      /*
       * Ce que chaque style fait d'un mot à son instant.
       *
       * Une durée nulle serait ignorée par GSAP, d'où le millième là où le
       * changement doit être instantané. Le flou est permis ici : la règle de
       * style.css interdit le flou plein cadre, qui triple le temps de
       * rendu en rastérisation logicielle. Un mot n'est pas plein cadre.
       */
      /*
       * Ce que chaque variante de titre fait de sa cible — un mot ou une
       * lettre selon la variante, décidé hors de la page.
       */
      const TITRES = {
        // L'entrée d'origine : le mot monte et grossit en rebondissant.
        reveal: { de: { opacity: 0, y: 26, scale: 0.92 }, vers: { opacity: 1, y: 0, scale: 1 }, ease: "back.out(1.7)" },
        neon: { de: { opacity: 0, y: 26, scale: 0.92 }, vers: { opacity: 1, y: 0, scale: 1 }, ease: "back.out(1.7)" },
        icon: { de: { opacity: 0, y: 26, scale: 0.92 }, vers: { opacity: 1, y: 0, scale: 1 }, ease: "back.out(1.7)" },
        pin: { de: { opacity: 0, y: 26, scale: 0.92 }, vers: { opacity: 1, y: 0, scale: 1 }, ease: "back.out(1.7)" },
        // La lettre apparaît, sans transition : une machine à écrire ne fond pas.
        typewriter: { de: { opacity: 0 }, vers: { opacity: 1 }, ease: "none" },
        // L'interlettrage se resserre. Le geste des titres de marque.
        tracking: { de: { opacity: 0, letterSpacing: "0.5em" }, vers: { opacity: 1, letterSpacing: "0em" }, ease: "power3.out" },
        // Les lettres tombent d'en haut, l'une après l'autre.
        cascade: { de: { opacity: 0, y: "-0.9em" }, vers: { opacity: 1, y: "0em" }, ease: "power2.out" },
        // Le mot arrive trop grand et se pose. Le titre de bande-annonce.
        slam: { de: { opacity: 0, scale: 2.4 }, vers: { opacity: 1, scale: 1 }, ease: "power4.out" },
        // Le mot monte du flou vers le net. Le flou est sur un mot, pas plein cadre.
        rise: { de: { opacity: 0, y: "0.5em", filter: "blur(8px)" }, vers: { opacity: 1, y: "0em", filter: "blur(0px)" }, ease: "power2.out" },
        // Une secousse chromatique brève, puis le mot se pose.
        glitch: { de: { opacity: 0, x: -8, skewX: 12 }, vers: { opacity: 1, x: 0, skewX: 0 }, ease: "steps(4)" },
      };

      const MOTS = {
        // Le mot s'allume et le reste. La lecture karaoké.
        karaoke: {
          de: { color: "rgba(255,255,255,0.42)" },
          vers: { color: "#ffffff", duration: 0.001, ease: "none" },
        },
        // Le mot monte et se révèle, sans changer de couleur.
        fondant: {
          de: { opacity: 0.25, y: "0.22em", filter: "blur(3px)" },
          vers: { opacity: 1, y: "0em", filter: "blur(0px)", duration: 0.28, ease: "power2.out" },
        },
        // Un bandeau de couleur balaie le mot actif. C'est le style des shorts.
        highlight: {
          de: { backgroundPosition: "100% 0", color: "rgba(255,255,255,0.55)" },
          vers: { backgroundPosition: "0% 0", color: "#ffffff", duration: 0.16, ease: "power1.out" },
        },
        // Chaque mot dans sa pastille, qui gonfle à son tour.
        pill: {
          de: { scale: 0.72, opacity: 0.4 },
          vers: { scale: 1, opacity: 1, duration: 0.22, ease: "back.out(2.2)" },
        },
        // Le mot se découvre de gauche à droite, sans bouger.
        wipe: {
          de: { clipPath: "inset(0 100% 0 0)", opacity: 1 },
          vers: { clipPath: "inset(0 0% 0 0)", duration: 0.24, ease: "power2.out" },
        },
        // La lueur monte avec le mot. Les mots porteurs gardent leur accent.
        neon: {
          de: { opacity: 0.25, scale: 0.94 },
          vers: { opacity: 1, scale: 1, duration: 0.2, ease: "power2.out" },
        },
        // Le dégradé apparaît en rebondissant.
        gradient: {
          de: { opacity: 0, scale: 0.88 },
          vers: { opacity: 1, scale: 1, duration: 0.32, ease: "back.out(1.8)" },
        },
        // Le texte s'inverse sur ce qu'il couvre : rien à animer que sa venue.
        blend: {
          de: { opacity: 0 },
          vers: { opacity: 1, duration: 0.12, ease: "none" },
        },
      };

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
            scene.shakeAt ?? scene.start
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
          const geste = TITRES[scene.kinetic.variant] || TITRES.reveal;
          scene.kinetic.cibles.forEach(function (cible, w) {
            tl.fromTo(
              "#" + cible,
              Object.assign({}, geste.de),
              Object.assign(
                { duration: scene.kinetic.duration, ease: geste.ease },
                geste.vers
              ),
              scene.kinetic.at + w * scene.kinetic.stagger
            );
          });
        }

        /*
         * Le compteur.
         *
         * On anime un objet nu et on écrit le texte à chaque image. C'est la
         * seule forme qui survive au saut arrière : le moteur cherche l'image,
         * GSAP recalcule la valeur depuis le temps absolu, et le texte suit.
         * Incrémenter un compteur à chaque appel donnerait une vidéo
         * différente à chaque rendu.
         */
        if (scene.counter) {
          const state = { v: scene.counter.from };
          const box = document.getElementById("n" + scene.index);
          const ring = scene.counter.ring
            ? document.getElementById("g" + scene.index)
            : null;
          const spread = scene.counter.to - scene.counter.from || 1;

          tl.fromTo(
            state,
            { v: scene.counter.from },
            {
              v: scene.counter.to,
              duration: scene.counter.duration,
              ease: "power2.out",
              onUpdate: function () {
                if (box) {
                  box.textContent =
                    scene.counter.prefix +
                    state.v.toFixed(scene.counter.decimals) +
                    scene.counter.suffix;
                }
                if (ring) {
                  const part = (state.v - scene.counter.from) / spread;
                  ring.style.setProperty("--fill", (part * 360).toFixed(1) + "deg");
                }
              },
            },
            scene.counter.at
          );
        }

        /*
         * Le style de sous-titre, en une table plutôt qu'en chaîne de tests.
         *
         * Tous ces styles font la même chose — révéler un mot à son instant —
         * et ne diffèrent que par la propriété animée. Une entrée par style
         * garde la boucle unique et rend l'ajout d'un style suivant sans
         * risque pour les précédents.
         *
         * 'cinematic' est à part : il ne révèle pas les mots un par un mais la
         * phrase entière avec la scène, comme un sous-titre de film.
         */
        if (T.subtitleStyle === "cinematic") {
          if (scene.words.length > 0) {
            tl.fromTo(
              "#c" + scene.index,
              { opacity: 0 },
              { opacity: 1, duration: 0.3, ease: "power2.out" },
              scene.start
            );
          }
        } else {
          const geste = MOTS[T.subtitleStyle] || MOTS.karaoke;
          scene.words.forEach(function (word, i) {
            tl.fromTo(
              "#w" + scene.index + "-" + i,
              Object.assign({}, geste.de),
              Object.assign({}, geste.vers),
              word.at
            );
          });
        }
      }

      /*
       * Les fondus des sons, posés sur la propriété volume de l'élément.
       *
       * Deux tweens séparés plutôt qu'un aller-retour : un son peut monter sans
       * retomber, et l'inverse. Chacun part d'un instant absolu.
       */
      for (const son of T.sfx) {
        const piste = document.getElementById(son.id);
        if (!piste) continue;

        if (son.monte > 0) {
          tl.fromTo(
            piste,
            { volume: 0 },
            { volume: son.cible, duration: son.monte, ease: "none" },
            son.at
          );
        }
        if (son.tombe > 0) {
          tl.fromTo(
            piste,
            { volume: son.cible },
            { volume: 0, duration: son.tombe, ease: "none" },
            son.fin - son.tombe
          );
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
