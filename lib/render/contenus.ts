/**
 * Les plans dont le contenu est une donnee : compteur, tiers inferieur,
 * graphique.
 *
 * Ils sont a part du reste de l animation pour une raison de fond. Un zoom ou
 * un tremblement anime la scene ; ceux-ci dessinent ce que la scene RACONTE.
 * Leur forme depend donc du contrat de rendu, pas du gout du monteur, et
 * c est ce qui les rattache au palier 3 du catalogue.
 *
 * Comme gestures.ts et animations.ts, c est du JavaScript de navigateur
 * transporte en chaine.
 *
 * ATTENTION : aucun accent grave ici. Un seul refermerait le gabarit.
 */

export const CONTENUS_JS = `
      function contenus(tl, scene) {
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

    /*
     * La roue tourne pendant que le nombre se compte : les deux lisent la
     * meme duree, donc ils s arretent ensemble. Le retard par rang pose les
     * unites avant les milliers, comme sur un compteur mecanique.
     */
    if (scene.counter.wheel) {
      scene.counter.wheel.forEach(function (rang, i) {
        tl.fromTo(
          "#wh" + scene.index + "-" + i,
          { yPercent: 0 },
          {
            yPercent: rang.to,
            duration: scene.counter.duration,
            ease: "power3.out",
          },
          scene.counter.at + (scene.counter.wheel.length - 1 - i) * 0.06
        );
      });
    }
  }

        /*
         * Le graphique.
         *
         * Toute la geometrie est calculee hors de la page : les barres
         * arrivent avec leur fraction de la plus grande valeur, la courbe avec
         * ses points deja projetes et la longueur de son trace. La page ne
         * fait qu animer des nombres deja poses.
         *
         * Les barres montent en decale, une par une, parce qu un graphique qui
         * apparait d un bloc ne se lit pas : l oeil n a pas le temps de
         * comparer. Le decale est une donnee, calculee dans plan.ts.
         */
        if (scene.chart) {
          scene.chart.bars.forEach(function (bar, i) {
            tl.fromTo(
              "#b" + scene.index + "-" + i,
              { "--part": 0, opacity: 0 },
              {
                "--part": bar.part,
                opacity: 1,
                duration: scene.chart.duration,
                ease: "power3.out",
              },
              scene.chart.at + i * scene.chart.stagger
            );
          });

          scene.chart.bars.forEach(function (bar, i) {
            const chiffre = document.getElementById(
              "bv" + scene.index + "-" + i
            );
            if (!chiffre) return;
            const etat = { v: 0 };
            tl.fromTo(
              etat,
              { v: 0 },
              {
                v: bar.value,
                duration: scene.chart.duration,
                ease: "power3.out",
                onUpdate: function () {
                  chiffre.textContent =
                    scene.chart.prefix +
                    etat.v.toFixed(scene.chart.decimals) +
                    scene.chart.suffix;
                },
              },
              scene.chart.at + i * scene.chart.stagger
            );
          });

          /*
           * La courbe se trace. strokeDashoffset part de la longueur totale et
           * descend a zero : le trait apparait de gauche a droite sans qu on
           * anime la moindre geometrie.
           */
          if (scene.chart.line) {
            /*
             * La courbe se decouvre par un volet, pas par des tirets.
             *
             * strokeDasharray semblait le bon outil, et il ne l est pas ici :
             * avec vector-effect non-scaling-stroke, les tirets se calculent
             * en pixels ecran, apres l etirement du SVG. Aucune longueur
             * mesuree dans le repere du trace ne peut donc coller — le motif
             * se repetait et un second morceau de courbe apparaissait,
             * detache, la ou le trait n etait pas encore passe.
             *
             * Un clip-path ne depend d aucune longueur : il decouvre de gauche
             * a droite, et le format n y change rien.
             *
             * A vitesse constante, et c est une contrainte et non un gout : les
             * pastilles s allument a des instants repartis regulierement, et
             * elles doivent s allumer quand le trait les atteint. Avec un
             * power2.inOut le volet part lentement puis rattrape — la pastille
             * du milieu s allumait avant que le trait n arrive dessus des que
             * la serie passait quatre points. Un trait qui se dessine a vitesse
             * constante est de toute facon ce que fait une main.
             */
            tl.fromTo(
              "#ln" + scene.index,
              { clipPath: "inset(0 100% 0 0)" },
              {
                clipPath: "inset(0 0% 0 0)",
                duration: scene.chart.duration * 1.6,
                ease: "none",
              },
              scene.chart.at
            );

            scene.chart.line.dots.forEach(function (dot, i) {
              tl.fromTo(
                "#ld" + scene.index + "-" + i,
                { opacity: 0, scale: 0 },
                { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" },
                scene.chart.at + dot.at
              );
            });
          }
        }

        /*
         * Le fil : chaque message arrive a son tour.
         *
         * Une bulle monte et s installe. Rien ne defile : sous la recherche
         * d image, un fil qui remonterait au fur et a mesure demanderait de
         * connaitre la hauteur des bulles precedentes, donc un calcul dans la
         * page. Elles sont posees des le depart et seule leur apparition est
         * animee.
         */
        if (scene.thread) {
          scene.thread.messages.forEach(function (message, i) {
            tl.fromTo(
              "#th" + scene.index + "-" + i,
              { opacity: 0, y: "0.6em", scale: 0.96 },
              {
                opacity: 1,
                y: "0em",
                scale: 1,
                duration: 0.32,
                ease: "back.out(1.6)",
              },
              message.at
            );

            if (message.typing) {
              const points = document.querySelectorAll(
                "#th" + scene.index + "-" + i + " .thread-typing i"
              );
              points.forEach(function (point, n) {
                tl.fromTo(
                  point,
                  { opacity: 0.3, y: "0em" },
                  {
                    opacity: 1,
                    y: "-0.18em",
                    duration: 0.22,
                    ease: "sine.inOut",
                    repeat: 5,
                    yoyo: true,
                  },
                  message.at + 0.3 + n * 0.12
                );
              });
            }
          });
        }
        /*
         * La citation : la phrase, puis la signature.
         *
         * Deux fromTo a deux instants absolus, jamais un delai relatif. La
         * signature arrive quand la phrase est lisible, pas quand la phrase a
         * fini de s animer : ce n est pas la meme chose sous la recherche
         * d image.
         */
        if (scene.quote) {
          tl.fromTo(
            "#q" + scene.index + " .quote-text",
            { opacity: 0, y: "0.4em" },
            {
              opacity: 1,
              y: "0em",
              duration: scene.quote.duration,
              ease: "power3.out",
            },
            scene.quote.at
          );
          tl.fromTo(
            "#q" + scene.index + " .quote-sign",
            { opacity: 0 },
            { opacity: 1, duration: 0.35, ease: "power2.out" },
            scene.quote.sign
          );
        }
        /*
         * La carte de reseau social : elle entre par son bord et elle repart.
         *
         * Deux fromTo a deux instants absolus, jamais une entree suivie d une
         * sortie relative : le moteur cherche chaque image, et une sortie
         * calee sur la fin de l entree ne saurait pas ou elle en est.
         */
        if (scene.socialCard) {
          tl.fromTo(
            "#sc" + scene.index,
            { opacity: 0, x: scene.socialCard.dx, scale: 0.94 },
            { opacity: 1, x: 0, scale: 1, duration: 0.5, ease: "back.out(1.4)" },
            scene.socialCard.at
          );
          tl.fromTo(
            "#sc" + scene.index,
            { opacity: 1 },
            { opacity: 0, duration: 0.35, ease: "power2.in" },
            scene.socialCard.out
          );
        }

        /*
         * La carte de cloture : la phrase, puis le bouton.
         *
         * Le bouton arrive apres, et c est tout le sujet — on lit la promesse
         * avant de voir ce qu on demande.
         */
        if (scene.callToAction) {
          tl.fromTo(
            "#ct" + scene.index + " .cta-headline",
            { opacity: 0, y: "0.5em" },
            { opacity: 1, y: "0em", duration: 0.55, ease: "power3.out" },
            scene.callToAction.at
          );
          tl.fromTo(
            "#cb" + scene.index,
            { opacity: 0, scale: 0.8 },
            { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.2)" },
            scene.callToAction.button
          );
        }

        /*
         * La liste et la comparaison : une entree par rang, en cascade.
         *
         * Meme geste pour les deux, et ce n est pas un raccourci : une ligne
         * qui arrive doit se lire de la meme facon qu on la compare ou qu on
         * l enumere. Seules les cibles changent.
         */
        function cascader(cibles, steps) {
          steps.forEach(function (step, i) {
            cibles(i).forEach(function (cible) {
              tl.fromTo(
                cible,
                { opacity: 0, x: "-0.5em" },
                {
                  opacity: 1,
                  x: "0em",
                  duration: 0.3,
                  ease: "power3.out",
                },
                step.at
              );
            });
          });
        }

        if (scene.list) {
          cascader(function (i) {
            return ["#li" + scene.index + "-" + i];
          }, scene.list.steps);
        }

        /*
         * Les deux colonnes au meme rang partent ensemble. Un cote qui se
         * remplirait en premier ferait lire deux listes au lieu d un
         * face-a-face, et c est tout ce que ce plan a a dire.
         *
         * Les cibles peuvent ne pas exister : un cote de trois lignes contre
         * un de une. GSAP accepte un selecteur sans correspondance.
         */
        if (scene.comparison) {
          cascader(function (i) {
            return [
              "#cp" + scene.index + "-left-" + i,
              "#cp" + scene.index + "-right-" + i,
            ];
          }, scene.comparison.steps);
        }
      }`;
