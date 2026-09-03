/**
 * La boucle qui anime chaque scene : fondu, zoom, tremblement, eclair,
 * titre cinetique, sous-titres.
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

        /*
         * Le tiers inferieur entre par son bord, puis repart.
         *
         * Deux fromTo et non un aller-retour : sous la recherche d'image, un
         * tween qui reviendrait sur lui-meme n'aurait pas d'instant absolu ou
         * s'accrocher. Chacun pose ses deux extremes a une seconde connue.
         */
        if (scene.lowerThird) {
          const cible = "#t" + scene.index;
          tl.fromTo(
            cible,
            { opacity: 0, x: scene.lowerThird.dx },
            { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" },
            scene.lowerThird.at
          );
          tl.fromTo(
            cible,
            { opacity: 1, x: 0 },
            { opacity: 0, x: scene.lowerThird.dx, duration: 0.3, ease: "power2.in" },
            scene.lowerThird.out
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
      }`;
