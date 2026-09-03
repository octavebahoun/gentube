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
      /*
       * L atelier manuscrit : trois gestes partages par toute la famille hw.
       *
       * hwTrace dessine des traits (dashoffset 100 vers 0 sur pathLength 100,
       * qui ne vaut que sur path). hwBouilli repose les traits en yoyo sec,
       * comme le shake : l instant donne la pose, pas l historique. 0 fige.
       */
      function hwTrace(tl, prefixe, traces) {
        traces.forEach(function (trace, i) {
          tl.fromTo(
            "#" + prefixe + "-" + i,
            { strokeDashoffset: 100 },
            { strokeDashoffset: 0, duration: trace.duree, ease: "power1.inOut" },
            trace.at
          );
        });
      }
      function hwBouilli(tl, prefixe, compte, at, duree, niveau) {
        const force = niveau >= 2 ? 2.2 : niveau > 0 ? 1.1 : 0;
        if (!force) return;
        for (let n = 0; n < compte; n += 1) {
          tl.fromTo(
            "#" + prefixe + "-" + n,
            { x: -force, y: force },
            {
              x: force,
              y: -force,
              duration: 0.09,
              ease: "none",
              repeat: Math.max(1, Math.round(duree / 0.09)),
              yoyo: true,
            },
            at
          );
        }
      }
      function hwEtiquette(tl, id, at) {
        tl.fromTo(
          "#" + id,
          { opacity: 0, scale: 0.6 },
          { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.7)" },
          at
        );
      }
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

        // L anneau de choc : un cercle qui s elargit et s efface, en une fois.
        // xPercent et yPercent portent le centrage : un scale GSAP ecrase le
        // translate CSS, et sans eux l anneau sauterait dans le coin du cadre.
        if (scene.shockRing) {
          tl.fromTo(
            "#sr" + scene.index,
            { xPercent: -50, yPercent: -50, scale: 0.55, opacity: 0.9 },
            {
              xPercent: -50,
              yPercent: -50,
              scale: 1.5,
              opacity: 0,
              duration: scene.shockRing.duration,
              ease: "power2.out",
            },
            scene.shockRing.at
          );
        }

        // Le projecteur : le cadre s assombrit sauf un trou doux, puis la
        // lumiere revient. Deux tweens separes pour naitre et mourir
        // invisibles, comme le tiers et le balayage.
        if (scene.featherSpot) {
          const fondu = Math.min(0.25, scene.featherSpot.duration / 3);
          tl.fromTo(
            "#fs" + scene.index,
            { opacity: 0 },
            { opacity: 1, duration: fondu, ease: "power1.out" },
            scene.featherSpot.at
          );
          tl.fromTo(
            "#fs" + scene.index,
            { opacity: 1 },
            { opacity: 0, duration: fondu, ease: "power1.in" },
            scene.featherSpot.at + scene.featherSpot.duration - fondu
          );
        }

        // La grille : un fond technique qui derive en boucle exacte. Une tuile
        // traverse en 6 secondes et le repeat repart de zero — sous la
        // recherche d image, la position vient de l instant, jamais du tour
        // precedent. Meme mecanique de backgroundPosition que le balayage.
        if (scene.gridDrift) {
          const voile = Math.min(0.3, scene.gridDrift.duration / 3);
          tl.fromTo(
            "#gd" + scene.index,
            { backgroundPosition: "0px 0px" },
            {
              backgroundPosition: "48px 48px",
              duration: 6,
              ease: "none",
              repeat: Math.max(0, Math.ceil(scene.gridDrift.duration / 6) - 1),
            },
            scene.gridDrift.at
          );
          tl.fromTo(
            "#gd" + scene.index,
            { opacity: 0 },
            { opacity: scene.gridDrift.opacity, duration: voile, ease: "power1.out" },
            scene.gridDrift.at
          );
          tl.fromTo(
            "#gd" + scene.index,
            { opacity: scene.gridDrift.opacity },
            { opacity: 0, duration: voile, ease: "power1.in" },
            scene.gridDrift.at + scene.gridDrift.duration - voile
          );
        }

        // Le curseur : il glisse vers sa cible, clique, repart. Quatre tweens
        // separes — trajet, bague, entree, sortie — chacun a son instant
        // absolu. Le trajet est en pixels de transform, pas en left/top : la
        // garde refuse les positions qui s arrondissent au pixel sous le
        // moteur. Les px viennent de la timeline, calculee au format exact.
        if (scene.cursorClick) {
          const clic = scene.cursorClick;
          const arrivee = clic.at + clic.duration * 0.55;
          tl.fromTo(
            "#cc" + scene.index,
            { opacity: 0 },
            { opacity: 1, duration: 0.12, ease: "power1.out" },
            clic.at
          );
          tl.fromTo(
            "#cc" + scene.index,
            { x: 0, y: 0 },
            {
              x: clic.xPx - clic.fromXpx,
              y: clic.yPx - clic.fromYpx,
              duration: clic.duration * 0.55,
              ease: "power2.inOut",
            },
            clic.at
          );
          tl.fromTo(
            "#cc" + scene.index + " .cursor-ring",
            { xPercent: -50, yPercent: -50, scale: 0.3, opacity: 0.8 },
            {
              xPercent: -50,
              yPercent: -50,
              scale: 1.6,
              opacity: 0,
              duration: clic.duration * 0.45,
              ease: "power2.out",
            },
            arrivee
          );
          tl.fromTo(
            "#cc" + scene.index,
            { opacity: 1 },
            { opacity: 0, duration: 0.15, ease: "power1.in" },
            clic.at + clic.duration - 0.15
          );
        }

        // Le viseur : les coins se posent, une ligne balaie, le cadre se
        // verrouille d un souffle. La ligne vise y en pixels, jamais top : la
        // garde refuse les positions qui s arrondissent. La course vient de
        // la timeline, calculee a la hauteur exacte du cadre.
        if (scene.scanGate) {
          const porte = scene.scanGate;
          const sortie = Math.min(0.25, porte.duration / 4);
          tl.fromTo(
            "#sg" + scene.index,
            { opacity: 0 },
            { opacity: 1, duration: 0.2, ease: "power1.out" },
            porte.at
          );
          tl.fromTo(
            "#sg" + scene.index + " .scan-line",
            { y: 0 },
            { y: porte.yPx, duration: porte.duration * 0.6, ease: "none" },
            porte.at + 0.15
          );
          tl.fromTo(
            "#sg" + scene.index,
            { scale: 1 },
            {
              scale: 1.02,
              duration: 0.12,
              ease: "power2.out",
              repeat: 1,
              yoyo: true,
            },
            porte.at + porte.duration * 0.6
          );
          tl.fromTo(
            "#sg" + scene.index,
            { opacity: 1 },
            { opacity: 0, duration: sortie, ease: "power1.in" },
            porte.at + porte.duration - sortie
          );
        }

        // L interrupteur : il s enfonce, la pastille glisse avec un depassement,
        // la piste vire a la couleur. Trois tweens au meme instant, trois
        // proprietes differentes — aucune ne se marche dessus. Le sens vient
        // de on : finir OFF rejoue le geste a l envers.
        if (scene.toggleFlip) {
          const bascule = scene.toggleFlip;
          const piste = bascule.on ? "#1faa53" : "#555b66";
          tl.fromTo(
            "#tf" + scene.index,
            { scale: 1 },
            { scale: 0.94, duration: 0.1, ease: "power2.in", repeat: 1, yoyo: true },
            bascule.at
          );
          tl.fromTo(
            "#tf" + scene.index + " .toggle-thumb",
            { x: bascule.on ? 0 : 28 },
            {
              x: bascule.on ? 28 : 0,
              duration: bascule.duration * 0.6,
              ease: "back.out(2)",
            },
            bascule.at + 0.08
          );
          tl.fromTo(
            "#tf" + scene.index,
            { backgroundColor: bascule.on ? "#555b66" : "#1faa53" },
            { backgroundColor: piste, duration: 0.3, ease: "power1.inOut" },
            bascule.at + 0.08
          );
        }

        // L aurore : trois nappes derivent a des vitesses premieres entre
        // elles, la combinaison ne se repete jamais dans la scene. Chaque
        // repeat repart de zero depuis at : sous la recherche d image, la
        // position vient de l instant. L enveloppe vit sur le conteneur.
        if (scene.auroraDrift) {
          const aurore = scene.auroraDrift;
          const voileAurore = Math.min(0.4, aurore.duration / 3);
          const nappes = [
            { classe: ".blob-a", course: 120, periode: 9 },
            { classe: ".blob-b", course: -140, periode: 13 },
            { classe: ".blob-c", course: 100, periode: 17 },
          ];
          nappes.forEach(function (nappe) {
            tl.fromTo(
              "#au" + scene.index + " " + nappe.classe,
              { x: 0 },
              {
                x: nappe.course,
                duration: nappe.periode,
                ease: "none",
                repeat: Math.max(0, Math.ceil(aurore.duration / nappe.periode) - 1),
              },
              aurore.at
            );
          });
          tl.fromTo(
            "#au" + scene.index,
            { opacity: 0 },
            { opacity: aurore.opacity, duration: voileAurore, ease: "power1.out" },
            aurore.at
          );
          tl.fromTo(
            "#au" + scene.index,
            { opacity: aurore.opacity },
            { opacity: 0, duration: voileAurore, ease: "power1.in" },
            aurore.at + aurore.duration - voileAurore
          );
        }

        // Le cadre : quatre bords se tracent dans le sens horaire, l un apres
        // l autre. Des divs et des echelles, pas du SVG : pathLength est
        // ignore sur les formes et le tiret tombait sur le vrai perimetre en
        // unites viewBox (verifie a l image, deux fois). Chaque bord n anime
        // qu un axe, jamais les deux sur la meme cible. Coins carres, meme
        // lecture.
        if (scene.outlineDraw) {
          const cadre = scene.outlineDraw;
          const quart = cadre.duration * 0.25;
          const bords = [
            { classe: " .od-t", echelle: "scaleX", ordre: 0 },
            { classe: " .od-r", echelle: "scaleY", ordre: 1 },
            { classe: " .od-b", echelle: "scaleX", ordre: 2 },
            { classe: " .od-l", echelle: "scaleY", ordre: 3 },
          ];
          bords.forEach(function (bord) {
            const de = {};
            de[bord.echelle] = 0;
            const vers = { duration: quart, ease: "power2.inOut" };
            vers[bord.echelle] = 1;
            tl.fromTo(
              "#od" + scene.index + bord.classe,
              de,
              vers,
              cadre.at + bord.ordre * quart
            );
          });
        }

        // La boite manuscrite : le trait sur la premiere moitie, le label
        // claque a mi-chemin, le bouilli prend ensuite.
        if (scene.hwBoxLabel) {
          const boite = scene.hwBoxLabel;
          const moitie = boite.duration / 2;
          hwTrace(tl, "hb" + scene.index, [{ at: boite.at, duree: moitie }]);
          if (boite.label) {
            hwEtiquette(tl, "hb" + scene.index + "-l", boite.at + moitie);
          }
          hwBouilli(tl, "hb" + scene.index, 1, boite.at + moitie, moitie, boite.boil);
        }

        // Le cercle d appel : meme geste, pose par x/y/size de la timeline.
        if (scene.hwCalloutCircle) {
          const appel = scene.hwCalloutCircle;
          const moitieAppel = appel.duration / 2;
          hwTrace(tl, "hc" + scene.index, [{ at: appel.at, duree: moitieAppel }]);
          if (appel.label) {
            hwEtiquette(tl, "hc" + scene.index + "-l", appel.at + moitieAppel);
          }
          hwBouilli(tl, "hc" + scene.index, 1, appel.at + moitieAppel, moitieAppel, appel.boil);
        }

        // Le cadre : bordure puis griffonnages, un tiers chacun. La legende
        // arrive avec la bordure finie.
        if (scene.hwFrame) {
          const cadreHw = scene.hwFrame;
          const tiersHw = cadreHw.duration / 3;
          hwTrace(tl, "hf" + scene.index, [
            { at: cadreHw.at, duree: tiersHw },
            { at: cadreHw.at + tiersHw, duree: tiersHw },
            { at: cadreHw.at + 2 * tiersHw, duree: tiersHw },
          ]);
          if (cadreHw.caption) {
            hwEtiquette(tl, "hf" + scene.index + "-l", cadreHw.at + tiersHw);
          }
          hwBouilli(tl, "hf" + scene.index, 3, cadreHw.at + tiersHw, 2 * tiersHw, cadreHw.boil);
        }

        // Le pipeline : les boites claquent, les liaisons se dessinent, les
        // legendes suivent leurs boites. Tout arrive predecoupe (boites,
        // traits, legendes), le tween ne fait que les poser en sequence.
        if (scene.hwPipeline) {
          const pipe = scene.hwPipeline;
          const pre = "hp" + scene.index;
          pipe.boxes.forEach(function (boite, i) {
            hwEtiquette(tl, pre + "-n" + i, boite.at);
          });
          hwTrace(tl, pre + "-c", pipe.traits);
          pipe.labels.forEach(function (label, i) {
            hwEtiquette(tl, pre + "-l" + i, label.at);
          });
          hwBouilli(tl, pre + "-c", pipe.traits.length, pipe.at, pipe.duration, pipe.boil);
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
