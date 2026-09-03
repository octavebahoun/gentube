/**
 * La boucle qui anime chaque scene : fondu, zoom, tremblement, eclair,
 * titre cinetique, sous-titres.
 *
 * Ce qui n est PAS ici : les plans dont le contenu est une donnee. Ils sont
 * dans contenus.ts, appeles par cette boucle. La separation n est pas
 * esthetique — elle dit qui possede quoi quand plusieurs mains travaillent le
 * meme moteur.
 *
 * Comme gestures.ts, c est du JavaScript de navigateur transporte en chaine.
 * Il lit les tables TITRES et MOTS, posees juste avant lui dans la page.
 *
 * ATTENTION : aucun accent grave ici non plus.
 */

export const SCENES_JS = `
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

        // Le balayage de lumiere : une bande diagonale traverse une fois.
        // La position du fond fait le trajet, l opacite fait l enveloppe :
        // naitre et mourir invisibles demande deux tweens separes, comme le
        // tiers. La mecanique est celle du highlight des mots, qui anime
        // deja backgroundPosition de 100% vers 0%.
        if (scene.lightSweep) {
          const bord = Math.min(0.15, scene.lightSweep.duration / 3);
          tl.fromTo(
            "#ls" + scene.index,
            { backgroundPosition: "100% 0" },
            {
              backgroundPosition: "0% 0",
              duration: scene.lightSweep.duration,
              ease: "none",
            },
            scene.lightSweep.at
          );
          tl.fromTo(
            "#ls" + scene.index,
            { opacity: 0 },
            { opacity: 1, duration: bord, ease: "power1.out" },
            scene.lightSweep.at
          );
          tl.fromTo(
            "#ls" + scene.index,
            { opacity: 1 },
            { opacity: 0, duration: bord, ease: "power1.in" },
            scene.lightSweep.at + scene.lightSweep.duration - bord
          );
        }

        // Le grain : un voile qui scintille, jamais fige. Un seul fromTo en
        // yoyo, comme l eclair : sous la recherche d image, c est l instant
        // qui donne l opacite, pas l historique des scintillements.
        if (scene.grain) {
          tl.fromTo(
            "#gr" + scene.index,
            { opacity: scene.grain.opacity * 0.55 },
            {
              opacity: scene.grain.opacity,
              duration: 0.12,
              ease: "none",
              repeat: Math.max(1, Math.round(scene.grain.duration / 0.12)),
              yoyo: true,
            },
            scene.grain.at
          );
        }

        // L accent sur le temps : le cadre respire une fois et retombe.
        // Pulse sur la scene, pas sur son image : l echelle du Ken Burns y
        // vit deja, et deux echelles sur la meme cible se battraient. Le
        // clip hisse est hors du div, lui, donc on l emmene aussi — une
        // video n a pas de zoom, son echelle est libre.
        if (scene.beatAccent) {
          const cibles = ["#s" + scene.index];
          if (scene.hoisted) cibles.push("#m" + scene.index);
          cibles.forEach(function (cible) {
            tl.fromTo(
              cible,
              { scale: 1 },
              {
                scale: 1 + scene.beatAccent.strength,
                duration: scene.beatAccent.duration / 2,
                ease: "power2.out",
                repeat: 1,
                yoyo: true,
              },
              scene.beatAccent.at
            );
          });
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

        // Les plans dont le contenu est une donnee : compteur, tiers,
        // graphique. Ils vivent dans contenus.ts, pas ici.
        contenus(tl, scene);

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
      }`;
