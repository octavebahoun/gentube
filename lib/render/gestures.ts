/**
 * Les tables de gestes de la page composee.
 *
 * Elles sont du JavaScript de navigateur, pas du TypeScript : elles partent
 * telles quelles dans le script de la page. On les tient ici pour que
 * composition.ts reste lisible — ce fichier ne fait que decrire des gestes,
 * celui-la assemble la page.
 *
 * ATTENTION : aucun accent grave dans ces chaines. Un seul refermerait le
 * gabarit qui les recoit.
 */
const BALAYAGE =
  'conic-gradient(from 0deg, #000 calc(var(--balayage, 0) * 1deg), transparent 0deg)';

export const TITRES_JS = `
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

        /*
         * Vingt variantes de plus, transposées des entrées de typographie du
         * registre. Certaines en sont l'équivalent visuel plutôt que la copie :
         * decode, reel et ticker font muter du texte dans le registre, ce
         * qui demande une suite déterministe pour survivre au saut arrière du
         * moteur. Elles sont ici rendues par un geste qui en donne la sensation
         * — un brouillage, un défilement vertical — sans mutation de contenu.
         */

        // Le mot arrive net et part vers le haut en se floutant.
        "blur-out": { de: { opacity: 0, y: "0.4em" }, vers: { opacity: 1, y: "0em" }, ease: "power2.out" },
        // Les lettres tenaient dispersées et se rassemblent.
        explode: { de: { opacity: 0, x: -26, y: 18, rotation: -14 }, vers: { opacity: 1, x: 0, y: 0, rotation: 0 }, ease: "power3.out" },
        // Une bascule de mise au point : du flou lourd vers le net.
        focus: { de: { opacity: 0.2, filter: "blur(14px)", scale: 1.06 }, vers: { opacity: 1, filter: "blur(0px)", scale: 1 }, ease: "power2.out" },
        // Chaque ligne entre par la gauche.
        lines: { de: { opacity: 0, x: "-0.8em" }, vers: { opacity: 1, x: "0em" }, ease: "power3.out" },
        // Le mot se pose vers le centre, comme une signature de marque.
        lockup: { de: { opacity: 0, y: "0.3em", letterSpacing: "0.24em" }, vers: { opacity: 1, y: "0em", letterSpacing: "0em" }, ease: "power3.out" },
        // Le brouillage : la lettre tremble avant de se fixer.
        decode: { de: { opacity: 0, y: -6, skewY: 8 }, vers: { opacity: 1, y: 0, skewY: 0 }, ease: "steps(6)" },
        // Un fondu doux avec une dérive verticale. Le geste calme.
        crossfade: { de: { opacity: 0, y: "0.18em" }, vers: { opacity: 1, y: "0em" }, ease: "power1.out" },
        // Une bande de distorsion passe une fois sur le mot.
        scan: { de: { opacity: 0, skewX: -22, scaleY: 1.3 }, vers: { opacity: 1, skewX: 0, scaleY: 1 }, ease: "power2.out" },
        // Bascule verticale : l'ancien sort par le haut, le nouveau entre par le bas.
        "axis-y": { de: { opacity: 0, y: "0.7em" }, vers: { opacity: 1, y: "0em" }, ease: "power3.out" },
        // Bascule en profondeur : le mot arrive de loin.
        "axis-z": { de: { opacity: 0, scale: 0.55 }, vers: { opacity: 1, scale: 1 }, ease: "power3.out" },
        // Un rouleau vertical qui s'arrête sur le mot.
        reel: { de: { opacity: 0, y: "-1.2em", scaleY: 1.4 }, vers: { opacity: 1, y: "0em", scaleY: 1 }, ease: "back.out(1.4)" },
        // Le mot monte et se révèle, décalé après le précédent.
        "fade-up": { de: { opacity: 0, y: "0.55em" }, vers: { opacity: 1, y: "0em" }, ease: "power2.out" },
        // Le mot est barré puis remplacé : on garde le trait qui traverse.
        strike: { de: { opacity: 0, scaleX: 0.2 }, vers: { opacity: 1, scaleX: 1 }, ease: "power4.out" },
        // Le défilement d'un bandeau d'information, qui se verrouille.
        ticker: { de: { opacity: 0, x: "1.4em" }, vers: { opacity: 1, x: "0em" }, ease: "power4.out" },
        // La respiration : rien ne bouge, tout se pose.
        calm: { de: { opacity: 0 }, vers: { opacity: 1 }, ease: "power1.inOut" },
        // Le titre s'ouvre en deux autour de ce qui arrive.
        split: { de: { opacity: 0, scaleY: 0.1 }, vers: { opacity: 1, scaleY: 1 }, ease: "power3.out" },
        // La graisse se pose, du fin vers le gras.
        weight: { de: { opacity: 0, scaleX: 1.25 }, vers: { opacity: 1, scaleX: 1 }, ease: "power2.out" },
        // Une crête d'épaisseur parcourt le titre, mot après mot.
        wave: { de: { opacity: 0, y: "0.35em", scaleY: 1.35 }, vers: { opacity: 1, y: "0em", scaleY: 1 }, ease: "elastic.out(1, 0.65)" },
        // Un mot de fond surdimensionné, posé derrière la phrase.
        backdrop: { de: { opacity: 0, scale: 1.18 }, vers: { opacity: 1, scale: 1 }, ease: "power2.out" },
        // Le mot tombe et rebondit une fois.
        drop: { de: { opacity: 0, y: "-1.4em" }, vers: { opacity: 1, y: "0em" }, ease: "bounce.out" },
        // Écriture manuscrite : tracé souple avec légère inclinaison.
        handwritten: { de: { opacity: 0, scale: 0.92, skewX: -8 }, vers: { opacity: 1, scale: 1, skewX: 0 }, ease: "power2.out" },
        // Surlignage au feutre : le mot monte avec une brillance accentuée.
        marker: { de: { opacity: 0, y: "0.2em", filter: "brightness(1.5)" }, vers: { opacity: 1, y: "0em", filter: "brightness(1)" }, ease: "power3.out" },
        // Défilement 3D en perspective.
        marquee: { de: { opacity: 0, x: "100%", rotationY: -15 }, vers: { opacity: 1, x: "0%", rotationY: 0 }, ease: "power2.out" },
        // Lockup de marque : resserrement d'interlettrage et calage.
        brand: { de: { opacity: 0, scale: 0.8, letterSpacing: "0.3em" }, vers: { opacity: 1, scale: 1, letterSpacing: "0.02em" }, ease: "back.out(1.6)" },
        stagger: { de: { opacity: 0, y: "0.4em", filter: "blur(4px)" }, vers: { opacity: 1, y: "0em", filter: "blur(0px)" }, ease: "power2.out" },
        stateswap: { de: { opacity: 0, y: "-0.3em", filter: "blur(6px)" }, vers: { opacity: 1, y: "0em", filter: "blur(0px)" }, ease: "power3.out" },
        prism: { de: { opacity: 0, scale: 1.15, filter: "blur(10px)" }, vers: { opacity: 1, scale: 1, filter: "blur(0px)" }, ease: "power2.out" },
        tiles: { de: { opacity: 0, scale: 0.7, rotation: -6 }, vers: { opacity: 1, scale: 1, rotation: 0 }, ease: "back.out(1.5)" },
        emphasis: { de: { opacity: 0, scale: 1.3 }, vers: { opacity: 0.15, scale: 1 }, ease: "power2.out" },
        popin: { de: { opacity: 0, y: "0.5em", scale: 0.6, filter: "blur(4px)" }, vers: { opacity: 1, y: "0em", scale: 1, filter: "blur(0px)" }, ease: "back.out(1.8)" },
        "badge-pop": { de: { opacity: 0, scale: 0.3 }, vers: { opacity: 1, scale: 1 }, ease: "elastic.out(1, 0.5)" },
        "card-resize": { de: { opacity: 0, scaleX: 0.8, scaleY: 0.6 }, vers: { opacity: 1, scaleX: 1, scaleY: 1 }, ease: "power3.out" },
        "icon-swap": { de: { opacity: 0, scale: 0.5, filter: "blur(6px)" }, vers: { opacity: 1, scale: 1, filter: "blur(0px)" }, ease: "power2.out" },
        "menu-morph": { de: { opacity: 0, rotation: -90, scale: 0.7 }, vers: { opacity: 1, rotation: 0, scale: 1 }, ease: "back.out(1.7)" },
        "skeleton-reveal": { de: { opacity: 0.3, filter: "blur(8px)" }, vers: { opacity: 1, filter: "blur(0px)" }, ease: "power2.inOut" },
        "success-check": { de: { opacity: 0, scale: 0.5, rotation: -20 }, vers: { opacity: 1, scale: 1, rotation: 0 }, ease: "back.out(2)" },
        "tilt-card": { de: { opacity: 0, rotationX: 25, y: "0.6em" }, vers: { opacity: 1, rotationX: 0, y: "0em" }, ease: "power3.out" },
        "input-feedback": { de: { opacity: 0, x: -12 }, vers: { opacity: 1, x: 0 }, ease: "elastic.out(1.2, 0.4)" },
        "micro-transitions": { de: { opacity: 0, y: "0.2em", scale: 0.95 }, vers: { opacity: 1, y: "0em", scale: 1 }, ease: "power2.out" },
        "panel-reveal": { de: { opacity: 0, scaleY: 0.2, transformOrigin: "top" }, vers: { opacity: 1, scaleY: 1 }, ease: "power3.out" },
        "tabs-slide-indicator": { de: { opacity: 0, x: "-0.5em" }, vers: { opacity: 1, x: "0em" }, ease: "power2.out" },
        "avatar-group-hover": { de: { opacity: 0, y: "0.4em", scale: 0.85 }, vers: { opacity: 1, y: "0em", scale: 1 }, ease: "back.out(1.6)" },
        callout: { de: { opacity: 0, scale: 0.9, y: "0.2em" }, vers: { opacity: 1, scale: 1, y: "0em" }, ease: "power2.out" },
        morphtext: { de: { opacity: 0, filter: "blur(12px)" }, vers: { opacity: 1, filter: "blur(0px)" }, ease: "power3.inOut" },
      };`;

export const MOTS_JS = `
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
      };`;

export const MOVES_JS = [
  '      const BALAYAGE =',
  '        "' + BALAYAGE + '";',
  `      /*
       * Vingt-trois gestes sans WebGL, transposes des paquets transitions-*
       * du registre.
       *
       * Trois familles, et elles ne se lisent pas de la meme facon :
       *
       * - les deplacements font bouger les deux scenes ;
       * - les volets ne bougent rien, ils decoupent la scene entrante pour
       *   laisser voir la sortante dessous ;
       * - les bascules font tourner la scene entrante sur une arete.
       *
       * La scene entrante est toujours au-dessus dans le document. Un geste
       * ou seule la sortante bougerait ne se verrait donc pas : c est
       * l entrante qui doit s effacer, se decouper ou se tourner.
       */
      const MOVES = {
        // Les poussees : le cadre entier glisse.
        "push-left":      { out: { x: "-100%" }, in: { x: "100%" } },
        "push-right":     { out: { x: "100%" },  in: { x: "-100%" } },
        "push-up":        { out: { y: "-100%" }, in: { y: "100%" } },
        "push-down":      { out: { y: "100%" },  in: { y: "-100%" } },
        "slide-diagonal": { out: { x: "-100%", y: "-100%" }, in: { x: "100%", y: "100%" } },
        // La meme poussee, mais elle depasse et revient. Le geste des shorts.
        "elastic-push":   { out: { x: "-100%" }, in: { x: "100%" }, ease: "elastic.out(1, 0.75)" },

        // Les echelles : la scene se traverse, s ecrase ou s etire.
        "zoom-through":   { out: { scale: 1.6, opacity: 0 }, in: { scale: 0.72 } },
        "zoom-out":       { out: { scale: 0.62, opacity: 0 }, in: { scale: 1.45 } },
        "squeeze":        { out: { scaleX: 0, opacity: 0 }, in: { scaleX: 0 }, ease: "power2.inOut" },
        // Le pli vertical, charniere en haut du cadre.
        "fold":           { out: { scaleY: 0, opacity: 0 }, in: { scaleY: 0 }, origin: "50% 0%", ease: "power2.inOut" },
        // L ecrasement puis l etirement, sur les deux axes a la fois.
        "stretch":        { out: { scaleX: 2.4, scaleY: 0.35, opacity: 0 }, in: { scaleX: 0.35, scaleY: 2.4 } },

        /*
         * Les volets. La sortante ne bouge pas — out vide veut dire du repos
         * vers le repos, ce qui ne deplace rien et reaffirme sa visibilite.
         * C est la decoupe de l entrante qui fait tout le geste.
         */
        "wipe-left":      { out: {}, in: { clipPath: "inset(0% 0% 0% 100%)" } },
        "wipe-right":     { out: {}, in: { clipPath: "inset(0% 100% 0% 0%)" } },
        "wipe-up":        { out: {}, in: { clipPath: "inset(100% 0% 0% 0%)" } },
        "wipe-down":      { out: {}, in: { clipPath: "inset(0% 0% 100% 0%)" } },
        // Le diaphragme rond. 100% couvre le cadre entier, coins compris.
        "iris-in":        { out: {}, in: { clipPath: "circle(0% at 50% 50%)" }, inTo: { clipPath: "circle(100% at 50% 50%)" } },
        // Le meme, mais rectangulaire.
        "box-iris":       { out: {}, in: { clipPath: "inset(50% 50% 50% 50%)" } },
        // Deux battants qui s ecartent.
        "barn-doors":     { out: {}, in: { clipPath: "inset(0% 50% 0% 50%)" } },
        // Un rideau qui s ouvre vers le haut et vers le bas.
        "curtain":        { out: {}, in: { clipPath: "inset(50% 0% 50% 0%)" } },
        /*
         * Le balayage d horloge. Le degrade conique lit une variable CSS que
         * GSAP fait tourner de 0 a 360 ; a 360 le masque est plein, donc la
         * scene reste entiere une fois la transition passee.
         */
        "clock-wipe":     {
          out: {},
          in: { "--balayage": 0, maskImage: BALAYAGE, webkitMaskImage: BALAYAGE },
          inTo: { "--balayage": 360, maskImage: BALAYAGE, webkitMaskImage: BALAYAGE },
        },

        /*
         * Les bascules. Une scene vue par la tranche ne se voit pas : c est ce
         * qui laisse la sortante apparaitre dessous au debut du geste.
         */
        "flip-x":         { out: { rotationY: -90, opacity: 0 }, in: { rotationY: 90 }, perspective: 1200 },
        "flip-y":         { out: { rotationX: 90, opacity: 0 }, in: { rotationX: -90 }, perspective: 1200 },
        // La rotation pleine, qui arrive en grandissant.
        "spin":           { out: { rotation: 90, scale: 0, opacity: 0 }, in: { rotation: -180, scale: 0 } },

        // Nouveaux mouvements issus du registre HyperFrames (Palier 1).
        "whip-pan-cut":       { out: { x: "-100%", opacity: 0.5 }, in: { x: "100%" }, ease: "power4.inOut" },
        "cut-the-curve":      { out: { x: "-100%" }, in: { x: "100%" }, ease: "power4.in" },
        "grid-pixelate-wipe": { out: {}, in: { clipPath: "inset(0% 0% 0% 0%)" }, ease: "steps(8)" },
        "rubber-band-bumper": { out: { x: "-100%" }, in: { x: "100%" }, ease: "back.out(2)" },
        "chromatic-wipe":     { out: { x: "-100%", opacity: 0.8 }, in: { x: "100%" }, ease: "power3.inOut" },
        "morph-swap":         { out: { scale: 0.3, opacity: 0 }, in: { scale: 1.8, opacity: 0 }, ease: "power2.inOut" },
        "parallax-zoom":      { out: { scale: 2, opacity: 0 }, in: { scale: 0.5 }, ease: "power2.out" },
        "parallax-unzoom":    { out: { scale: 0.5, opacity: 0 }, in: { scale: 2 }, ease: "power2.out" },
        "page-slide":         { out: { x: "-20%", scale: 0.95 }, in: { x: "100%" }, ease: "power2.out" },
        "halftone-dissolve":  { out: {}, in: { clipPath: "circle(0% at 50% 50%)" }, inTo: { clipPath: "circle(120% at 50% 50%)" }, ease: "power2.inOut" },
        "type-match-cut":     { out: { scaleY: 0, opacity: 0 }, in: { scaleY: 1.5 }, ease: "power3.inOut" },
        "match-cut":          { out: { scale: 0.1, opacity: 0 }, in: { scale: 1.2 }, ease: "power3.out" },
        "freeze-cut":                  { out: { filter: "brightness(1.5) contrast(1.2)" }, in: { opacity: 0 }, inTo: { opacity: 1 }, ease: "steps(2)" },
        "editorial-flash-overlay":    { out: { opacity: 0.2, filter: "brightness(2)" }, in: { opacity: 0 }, inTo: { opacity: 1 }, ease: "power4.inOut" },
        "hw-scribble-transition":     { out: { scale: 0.95 }, in: { clipPath: "inset(0% 100% 0% 0%)" }, inTo: { clipPath: "inset(0% 0% 0% 0%)" }, ease: "power2.inOut" },
        "vfx-text-cursor":            { out: { opacity: 0 }, in: { opacity: 0, scale: 1.1 }, inTo: { opacity: 1, scale: 1 }, ease: "power3.out" },
        "organic-light-leak-overlay": { out: { opacity: 0.5 }, in: { opacity: 0, filter: "brightness(1.8)" }, inTo: { opacity: 1, filter: "brightness(1)" }, ease: "power2.inOut" },
        "ordered-dither-pass":        { out: { filter: "contrast(2)" }, in: { opacity: 0 }, inTo: { opacity: 1 }, ease: "steps(4)" },
        "parallax-device-dive":       { out: { scale: 3, opacity: 0 }, in: { scale: 0.3 }, inTo: { scale: 1 }, ease: "power3.inOut" },
        "halftone-field":             { out: { opacity: 0 }, in: { opacity: 0, scale: 1.2 }, inTo: { opacity: 1, scale: 1 }, ease: "power2.out" },
      };`,
].join('\n');
