import type { HyperframesStoryboard } from '@/lib/storyboard/render';
import { SCENES_JS } from './animations';
import { MOTS_JS, MOVES_JS, TITRES_JS } from './gestures';
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
    ? `<audio id="music" src="${escapeHtml(encodeURI(storyboard.music))}" data-start="0" ` +
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
${TITRES_JS}

${MOTS_JS}

${SCENES_JS}

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
${MOVES_JS}

      /*
       * Le repos de chaque propriete que les gestes touchent.
       *
       * On ne pose sur la scene que les proprietes du geste en cours : une
       * rotation neutre de plus suffit a faire basculer le rendu en matrice
       * 3D, et le rendu logiciel de Lambda n y trace pas les memes pixels.
       */
      const NEUTRE = {
        x: "0%",
        y: "0%",
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        rotationX: 0,
        rotationY: 0,
        opacity: 1,
        clipPath: "inset(0% 0% 0% 0%)",
        maskImage: "none",
        webkitMaskImage: "none",
        "--balayage": 360,
      };

      for (const move of T.moves) {
        const shape = MOVES[move.kind];
        if (!shape) continue;

        /*
         * Le socle : le repos historique, plus le repos des seules
         * proprietes que ce geste-ci fait bouger.
         *
         * Ni scale ni scaleX en dur. GSAP traite scale comme un raccourci qui
         * ecrit scaleX ET scaleY : pose a cote d un scaleX a zero, il
         * l ecrasait a 1 et le geste ne bougeait plus. fold, squeeze et
         * stretch rendaient une scene entiere et immobile, et la garde
         * visuelle ne pouvait pas le dire — elle n avait pas encore de
         * reference a comparer. La boucle ci-dessous ne pose que ce que la
         * forme touche, et aucune forme ne melange les deux.
         */
        const socle = { x: "0%", y: "0%", opacity: 1, visibility: "visible" };
        for (const forme of [shape.out, shape.in, shape.fromOut, shape.inTo]) {
          for (const cle in forme) {
            if (cle in NEUTRE && !(cle in socle)) socle[cle] = NEUTRE[cle];
          }
        }
        if (shape.origin) socle.transformOrigin = shape.origin;
        if (shape.perspective) socle.transformPerspective = shape.perspective;

        const tempo = { duration: move.duration, ease: shape.ease || "power3.inOut" };

        /*
         * Les deux scènes ET leurs clips.
         *
         * Un plan animé porte son element video hors du div de scène, avec sa
         * propre piste — imbriqué, le moteur le sortirait gelé. Conséquence :
         * déplacer le div ne déplace pas le clip. Sans ces cibles en plus, une
         * poussée faisait glisser les sous-titres pendant que l'image restait
         * immobile.
         */
        const partants = ["#s" + move.from];
        const entrants = ["#s" + move.to];
        if (T.scenes[move.from] && T.scenes[move.from].hoisted) {
          partants.push("#m" + move.from);
        }
        if (T.scenes[move.to] && T.scenes[move.to].hoisted) {
          entrants.push("#m" + move.to);
        }

        // La sortante part de sa position de repos vers l'ailleurs du geste.
        for (const cible of partants) {
          tl.fromTo(
            cible,
            Object.assign({}, socle, shape.fromOut),
            Object.assign({}, socle, shape.out, tempo),
            move.at
          );
        }

        // L'entrante fait le trajet inverse et finit au repos, opaque.
        for (const cible of entrants) {
          tl.fromTo(
            cible,
            Object.assign({}, socle, shape.in),
            Object.assign({}, socle, shape.inTo, tempo),
            move.at
          );
        }
      }


      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
