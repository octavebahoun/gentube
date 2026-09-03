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
            tl.fromTo(
              "#ln" + scene.index,
              { strokeDashoffset: scene.chart.line.length },
              {
                strokeDashoffset: 0,
                duration: scene.chart.duration * 1.6,
                ease: "power2.inOut",
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
      }`;
