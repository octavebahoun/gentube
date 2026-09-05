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

import { NAPPES_JS, MANUSCRIT_TWEENS_JS } from './nappes';

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

        // Le mouvement de camera : il se compose avec le Ken Burns au lieu de
        // le remplacer. Le zoom porte l echelle, celui-ci porte la translation
        // ou l inclinaison — deux proprietes que GSAP tient separement sur le
        // meme element. Un mode qui viserait l echelle aurait ecrase l autre
        // en silence, et c est pour ca qu il n existe pas.
        if (scene.hasMedia && scene.cameraMove) {
          const cam = scene.cameraMove;
          const glisse = cam.mode === "slide";
          tl.fromTo(
            "#m" + scene.index,
            glisse ? { xPercent: -3.5 } : { rotation: -1.2 },
            glisse
              ? { xPercent: 3.5, duration: cam.duration, ease: "none" }
              : { rotation: 1.2, duration: cam.duration, ease: "none" },
            cam.at
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

${NAPPES_JS}${MANUSCRIT_TWEENS_JS}
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

        if (scene.mkBackground) {
          tl.fromTo("#mb" + scene.index, { opacity: 0 }, { opacity: scene.mkBackground.opacity || 0.9, duration: 0.5, ease: "power1.out" }, scene.mkBackground.at || scene.start);
        }
        if (scene.ytLcdBackground) {
          tl.fromTo("#lb" + scene.index, { opacity: 0 }, { opacity: scene.ytLcdBackground.opacity || 0.85, duration: 0.5, ease: "power1.out" }, scene.ytLcdBackground.at || scene.start);
        }
        if (scene.meshGradientBg) {
          tl.fromTo("#mg" + scene.index, { opacity: 0 }, { opacity: scene.meshGradientBg.opacity || 0.8, duration: 0.5, ease: "power1.out" }, scene.meshGradientBg.at || scene.start);
        }
        if (scene.beatPulseBackground) {
          tl.fromTo("#bp" + scene.index, { opacity: 0 }, { opacity: scene.beatPulseBackground.opacity || 0.7, duration: 0.2, ease: "power2.out", repeat: 1, yoyo: true }, scene.beatPulseBackground.at || scene.start);
        }
        if (scene.grainField) {
          tl.fromTo("#gf" + scene.index, { opacity: 0 }, { opacity: scene.grainField.opacity || 0.5, duration: 0.4, ease: "power1.out" }, scene.grainField.at || scene.start);
        }
        if (scene.camcorderHud) {
          tl.fromTo("#ch" + scene.index, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, scene.camcorderHud.at || scene.start);
        }
        if (scene.ytScreenWarp) {
          tl.fromTo("#sw" + scene.index, { opacity: 0 }, { opacity: scene.ytScreenWarp.opacity || 0.8, duration: 0.4, ease: "power1.out" }, scene.ytScreenWarp.at || scene.start);
        }
        if (scene.ytFeatherHighlight) {
          tl.fromTo("#fh" + scene.index, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, scene.ytFeatherHighlight.at || scene.start);
        }
        if (scene.lightSweepPass) {
          tl.fromTo("#lsp" + scene.index, { backgroundPosition: "100% 0", opacity: 0 }, { backgroundPosition: "0% 0", opacity: 1, duration: scene.lightSweepPass.duration || 1.5, ease: "power2.inOut" }, scene.lightSweepPass.at || scene.start);
        }
        if (scene.glossSweep) {
          tl.fromTo("#gs" + scene.index, { opacity: 0, scaleX: 0.8, scaleY: 0.8 }, { opacity: scene.glossSweep.opacity || 0.6, scaleX: 1.1, scaleY: 1.1, duration: scene.glossSweep.duration || 1.0, ease: "power1.out" }, scene.glossSweep.at || scene.start);
        }
        if (scene.inlineHighlight) {
          tl.fromTo("#ih" + scene.index, { opacity: 0 }, { opacity: 1, duration: scene.inlineHighlight.duration || 0.8, ease: "power2.out" }, scene.inlineHighlight.at || scene.start);
        }
        if (scene.confetti) {
          tl.fromTo("#cf" + scene.index, { opacity: 0, scaleX: 0.5, scaleY: 0.5 }, { opacity: 1, scaleX: 1.2, scaleY: 1.2, duration: scene.confetti.duration || 1.5, ease: "back.out(1.7)" }, scene.confetti.at || scene.start);
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
        /*
         * Les lignes de sous-titre, quand la scene en a plus d une.
         *
         * Le tableau "lines" est vide en dessous de dix mots : le conteneur
         * unique reste visible toute la scene, comme il l a toujours fait.
         * Au-dela, chaque ligne entre a son premier mot et sort apres son
         * dernier — sinon un transcript de deux cents mots s empilerait a
         * l ecran.
         *
         * L opacite est posee sur le CONTENEUR et jamais sur le mot : quatre
         * styles animent deja celle du mot, et deux tweens sur la meme
         * propriete du meme element se battent.
         *
         * Et pour la meme raison, l entree et la sortie de la ligne vivent sur
         * DEUX elements. Un fromTo applique son etat de depart des la
         * construction de la timeline : une sortie posee sur le conteneur
         * remettait chaque ligne a opacity 1 avant meme la premiere image, donc
         * treize lignes empilees a l ecran. L enveloppe porte la sortie, le
         * conteneur porte l entree, et les deux opacites se multiplient.
         *
         * Deux fromTo a des instants absolus, comme partout ici : le moteur
         * cherche chaque image au lieu de jouer, et une animation qui accumule
         * du temps marche dans l apercu puis casse au rendu.
         *
         * ATTENTION : pas d accent grave dans ce commentaire. Il vit dans un
         * litteral de gabarit, et un accent grave le refermerait — l erreur
         * serait rapportee a une ligne qui n a rien a voir.
         */
        for (let l = 0; l < scene.lines.length; l += 1) {
          const ligne = scene.lines[l];
          tl.fromTo(
            "#c" + scene.index + "-" + l,
            { opacity: 0 },
            { opacity: 1, duration: 0.22, ease: "power2.out" },
            ligne.at
          );
          /*
           * La sortie FINIT a "out", elle ne commence pas la.
           *
           * Le plan borne "out" a l entree de la ligne suivante, et les lignes
           * occupent le meme bas d ecran. Demarrer le fondu de sortie a cet
           * instant laisserait les deux lisibles ensemble le temps du fondu.
           */
          const sortie = Math.max(ligne.at, ligne.out - 0.16);
          tl.fromTo(
            "#o" + scene.index + "-" + l,
            { opacity: 1 },
            { opacity: 0, duration: 0.16, ease: "power2.in" },
            sortie
          );
        }

        if (T.subtitleStyle === "cinematic") {
          // Une seule ligne : c est la scene entiere qui la fait apparaitre.
          // Plusieurs : la boucle ci-dessus s en occupe deja.
          if (scene.words.length > 0 && scene.lines.length <= 1) {
            tl.fromTo(
              "#c" + scene.index + "-0",
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
