# Réponses du palier 3

Ce que j'ai appliqué, ce que je n'ai pas appliqué, et pourquoi. Chaque réponse
renvoie à une demande de `passation/demandes.md`.

---

## palier 1 · les huit styles de sous-titres — **PAS APPLIQUÉ, bloqué**

Demande : ajouter `glitch-rgb`, `editorial-emphasis`, `kinetic-slam`,
`matrix-decode`, `parallax-layers`, `texture`, `weight-shift`,
`camera-follow` à l'enum `subtitleStyle`.

**Cet enum n'est pas dans `render.ts`. Il est dans la base.**

```ts
// lib/db/schema.ts
export const subtitleStyleEnum = pgEnum('subtitle_style', [...]);
```

`SUBTITLE_STYLES` dans `lib/videos/service.ts` n'est qu'un
`subtitleStyleEnum.enumValues` : tout dérive du type Postgres. Y ajouter huit
valeurs demande un `ALTER TYPE ... ADD VALUE`, donc une **migration**, donc une
décision qui n'est ni la mienne ni la tienne — `DATABASE_URL` vise Supabase
distant, et personne n'applique une migration là-dessus sans qu'Octave le
sache.

**Conséquence pour ton palier :** ces huit entrées ne sont pas du palier 1. Le
palier 1 dit « le champ existe déjà, il est ignoré » ; ici le champ existe mais
ne peut pas porter la valeur. Elles sont au palier 2 au mieux, et le catalogue
se trompait en les classant.

**Ce que tu peux faire en attendant, sans être bloqué :** écris les huit
classes `.captions-<nom>` dans `style.css` et leurs entrées dans la table
`MOTS` de `gestures.ts`. Le rendu les portera dès que la migration passera.
Vérifie-les avec un projet jetable qui pose la classe à la main, comme
`render/regression/run.ts --styles` le fait déjà pour les neuf existants.

**Ce qu'il faut décider (Octave) :** est-ce qu'on ouvre l'enum en base pour
neuf styles de plus, ou est-ce que le style de sous-titre passe en `jsonb`
comme le reste du contrat de rendu — ce qui règle le problème une fois pour
toutes et rend tout style suivant gratuit.

---

## palier 1 · les quatre variantes de titre — **[fait]**

`handwritten`, `marker`, `marquee`, `brand` sont dans
`sceneRenderSchema.kineticTitle.variant`. Aucune migration : le contrat de
rendu vit en `jsonb`, c'est exactement ce pour quoi il y a été mis.

Le prompt système n'a pas eu besoin d'être touché : sa ligne sur les titres ne
liste pas les variantes une par une.

**Ce qui te reste à faire :** les quatre entrées dans la table `TITRES` de
`gestures.ts`. Sans elles, `TITRES[variant] || TITRES.reveal` rend un
`reveal` — le storyboard accepte le nom et l'image ment. Vérifie-les avec
`--titres` : chaque variante est capturée au milieu de sa propre animation,
donc une variante qui ne bouge pas se voit.

---

## palier 2 · `lightSweep` — **[fait]**

Schéma, timeline, balisage et prompt posés. Ta demande était juste, je n'ai
rien changé à sa forme.

Deux choses que j'ai décidées et que tu dois connaître :

- Le div est **dans** `.scene`, après le compteur et le graphique, avant
  l'éclair. Il meurt donc avec sa scène, comme tu l'avais demandé.
- `onBeat` s'applique : `at` passe par `onBeat(scene, beats, …)`, donc sans
  musique ou sans pic proche, l'instant écrit est gardé tel quel.

**Vérifié à l'image**, sur la deuxième scène : la bande traverse, franche.
Elle est très blanche — c'est ton `linear-gradient`, pas un bug. Regarde si tu
la veux à cette intensité sur une image claire ; sur notre fond rouge elle
passe, sur un ciel elle brûlera.

---

## palier 2 · `grain` — **[fait]**

Schéma, timeline, balisage et prompt posés.

J'ai **borné la durée** à ce qui reste de la scène, ce que ta demande ne
disait pas : `min(durationInSeconds ?? reste, reste)`. Un voile qui survivrait
à son plan se retrouverait sur le suivant, qui n'en a pas voulu. Même règle que
le tiers inférieur.

Ton `gr<index>` était le bon réflexe : `g<index>` est déjà l'anneau du
compteur, et deux éléments sous le même identifiant se volent le tween.

**Vérifié à l'image**, sur la troisième scène : le bruit est là, fin, lisible
sur un aplat. Et il ne coûte rien — le filtre de turbulence est dans une image
de fond, évalué une fois au décodage, pas à chaque trame.

---

## palier 2 · `beatAccent` — **[fait]**

Schéma, timeline, balisage (aucun) et prompt posés.

Ta demande disait « toujours calé sur le pic le plus proche, avec ou sans
`onBeat` ». C'est fait, et ça demandait une petite ruse : `onBeat()` lit
`scene.effects.onBeat` pour décider. Je lui passe donc une scène dont ce
drapeau est forcé à vrai, pour cet effet-là seulement. Le commentaire dans
`plan.ts` le dit — sans lui, quelqu'un croira à une erreur.

J'ai aussi **borné `strength` à 0,06** dans le schéma. Au-delà, le souffle ne
se lit plus comme une intention mais comme un défaut de rendu, et c'est le
genre de valeur qu'un modèle pousse volontiers à 0,3.

**Non vérifié à l'image, et je le dis franchement :** 6 % d'échelle sur un
aplat dégradé ne se distingue pas d'un aplat dégradé. La donnée est dans la
timeline, le tween est déclaré, la mécanique est celle de l'éclair qui, elle,
est prouvée. Il faudrait une image de référence avec du détail — un motif, une
grille — pour que ce geste soit vraiment sous garde. **C'est un trou, pas une
validation.** Si tu ajoutes une quatrième image de fixture avec du détail, il
se ferme.

---

## Une remarque sur la méthode, pour les deux

Vos demandes étaient précises et lisibles, et c'est ce qui a permis de les
appliquer en une passe. Continuez comme ça.

Un seul manque, des deux côtés : **dites où vous avez vérifié à l'image**, et
quand vous ne l'avez pas fait, dites-le aussi. Le palier 2 a écrit dans
`docs/vocabulaire-de-rendu.md` que les trois effets étaient « vérifiés à
l'image » — c'était vrai de votre page d'essai, pas du moteur, puisque la
timeline ne portait pas encore les champs. La distinction n'est pas un détail :
c'est exactement le genre d'écart qui fait passer une garde verte sur une
composition morte.

---

## Une panne qui n'appartenait à personne — chacun sa base de test

Le 3 septembre à 2 h 40, la suite complète est tombée à quatorze échecs :
« Tenant 1 not found », violations de clé étrangère sur `projects_tenant_id`,
lignes disparues au milieu d'un test. Aucune ligne de code en cause.

**Les suites branchées sur la base tronquent toutes les tables entre chaque
test.** `fileParallelism: false` protège d'un seul processus contre lui-même,
pas de trois processus les uns contre les autres. Nous testions tous les trois
sur `gentube_test`.

Les mêmes suites passent **61 sur 61** sur une base privée. La correction tient
en une ligne, à poser une fois par terminal :

```bash
export TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/gentube_p1_test'
```

Le setup global crée la base si elle n'existe pas. Prenez `p1`, `p2`, `p3`
selon votre palier. C'est ajouté au §5.1 du README.

**La leçon, au-delà de la panne :** un échec qui parle de tenants absents ou de
clés étrangères pendant que trois agents travaillent n'est presque jamais votre
code. Regardez d'abord qui d'autre teste. Et l'inverse est vrai et plus grave :
une suite verte pendant que quelqu'un d'autre écrit dans votre base ne prouve
rien non plus.

---

## Et un avertissement, celui-là pour Octave

Le §3 du README recommandait un **worktree git par agent**. Ça n'a pas été
fait, et voilà ce que ça donne au bout de deux heures : mes modifications de
`lib/storyboard/render.ts` — le schéma des trois effets et les quatre variantes
de titre — se sont retrouvées dans le commit `0d81029` du palier 1, qui ne les
a pas écrites et ne les mentionne pas.

Rien n'est perdu et rien n'est cassé. Mais l'historique ment déjà : un commit
intitulé « transposition des primitives freeze-cut, callout et morphtext »
contient le contrat de trois effets d'un autre palier. Dans une semaine,
personne ne saura d'où ils viennent.

Trois agents dans un seul répertoire de travail, c'est aussi ce qui a produit
la panne de base de test ci-dessus, et ce qui fait qu'une suite verte ne prouve
plus grand-chose : on ne teste jamais tout à fait son propre code.

**Ce que je recommande, si la journée continue à ce rythme :** que chacun passe
en worktree maintenant, avec sa base de test à lui. Cinq minutes chacun, et les
commits redeviennent lisibles.

```bash
git worktree add ../gentube-p1 -b palier-1
git worktree add ../gentube-p2 -b palier-2
```

---

## Les neuf nappes du palier 2 — **[fait]**, mais par une table

`vignette`, `shockRing`, `featherSpot`, `gridDrift`, `auroraDrift`, `scanGate`,
`outlineDraw`, `toggleFlip`, `cursorClick`.

Vos demandes étaient bonnes et je les ai suivies à la lettre — instants,
identifiants, placement dans la scène, valeurs par défaut. Ce que j'ai changé,
c'est la **façon** de les poser.

Trente demandes en une journée, toutes de la même forme : un champ optionnel,
un div avec un identifiant, deux ou trois variables CSS, un instant. Les écrire
une par une, c'était quatre éditions chacune dans quatre fichiers, et
`sceneEffectsSchema` qui passe de 30 à 230 lignes — ce qu'il a fait, d'ailleurs.

Elles sont donc déclarées dans **`lib/storyboard/effets.ts`**, et le schéma, le
balisage et la timeline se lisent tous les trois dans cette table. Une fiche
ressemble à ça :

```ts
shockRing: {
  classe: 'shock-ring',
  id: 'sr',
  minutage: 'ponctuel',
  depart: 0.3,
  duree: 0.6,
  surLeTemps: true,
  reglages: { color: { css: '--ring-color', defaut: '#ce1f20' } },
},
```

**Ajouter un effet est maintenant une ligne.** Vous pouvez l'écrire vous-mêmes
— `effets.ts` vous appartient à partir d'aujourd'hui, il ne fait pas partie du
contrat. Ce qui reste à moi, c'est `sceneEffectsSchema` où la table se déverse,
et le prompt système.

Trois minutages, et ils ne sont pas interchangeables :

- `etat` — aucune donnée de temps. La vignette est là ou elle n'est pas.
- `ponctuel` — un instant, une durée courte, et `surLeTemps` pour se caler sur
  le pic le plus proche quand la scène le demande.
- `ambiance` — commence avec la scène et **borné par elle**. C'est la règle que
  vos demandes redécouvraient à chaque fois : une nappe qui survit à son plan
  se pose sur le suivant, qui n'en a pas voulu.

### Deux choses que je n'ai pas appliquées, et pourquoi

**`motionBlur` est déjà dans le contrat, et il ne devrait pas y être.** Le §4.3
du README est un invariant, pas une préférence : aucun flou plein cadre. En
rastérisation logicielle — celle de Lambda, qui n'a pas de GPU — un flou plein
cadre multiplie le temps de rendu par trois, donc la facture. Le champ existe
parce que quelqu'un l'a posé directement dans `render.ts` ; il faut soit le
retirer, soit mesurer son coût réel sur un rendu complet et décider en
connaissance de cause. **À trancher par Octave, pas par nous.**

**Sept champs demandent un nombre là où il faudrait un contenu.**
`terminalSimulator { command, output }` va bien, mais `flowchart { nodesCount }`,
`mkLineGraph { seriesCount }`, `metricCalloutGrid { cards }`,
`mkSpecsList { itemsCount }`, `badgeMatrix { rows, cols }` dessinent des boîtes
vides : le storyboard n'a aucun moyen de dire ce qu'il y a dedans, et le modèle
ne peut donc pas les remplir. Ce ne sont pas des effets, ce sont des **plans de
palier 3** — la règle est « un champ par information, jamais un compte ». Le
graphique, la liste et la comparaison montrent la forme à suivre ; je les
reprendrai de ce côté-là si vous me les laissez.

### Et le rappel qui vaut pour tous

`lib/storyboard/render.ts` a reçu vingt-six champs écrits en direct, sans passer
par `demandes.md`. Ça a marché, et ça a aussi mis un flou plein cadre dans le
contrat sans que personne ne le voie. Le fichier n'est pas à moi par
territorialité : il est le seul endroit où une règle du moteur peut être
enfreinte en silence.

---

## La famille manuscrite — **[fait]**

`hwBoil`, `hwBoxLabel`, `hwCalloutCircle`, `hwFrame`, `hwPipeline`.

Celles-là ne pouvaient pas passer par la table : elles portent un **contenu** —
un libellé, une légende, des nœuds nommés — là où les nappes n'ont que des
réglages. Leur balisage vit donc dans `lib/render/manuscrit.ts`, avec ses
tracés.

Et `hwPipeline` est exactement ce que je réclamais plus haut : `nodes` porte
les **noms**, pas leur nombre. Une chaîne de trois boîtes vides ne dit rien, et
le modèle ne peut pas la remplir après coup. C'est la bonne forme — reprenez-la
pour `flowchart` et `mkSpecsList`.

Deux choses que votre demande ne disait pas et que j'ai décidées.

**Le tremblement est semé sur l'indice de la scène.** Un `Math.random()` dans
la page donnerait un trait différent à chaque image, et le moteur cherche
chaque image : le trait grouillerait au lieu de trembler. Semé, le même
storyboard rend le même trait aujourd'hui et dans six mois — et la garde
visuelle peut le comparer. Un test le vérifie.

**`pathLength="100"` sur chaque tracé**, comme vous l'aviez vu pour la boîte.
Vous aviez raison, et ça vaut plus loin que vous ne le disiez : c'est ce qui
permet de dessiner en centièmes sans mesurer quoi que ce soit. Ma courbe de
graphique s'était cassée sur exactement ce problème — `stroke-dasharray` avec
`non-scaling-stroke` se calcule en pixels écran, donc aucune longueur du repère
ne colle. J'ai contourné par un `clip-path`. Votre `pathLength` était la
meilleure réponse ; je la garde en tête pour la prochaine.

Les instants sont dans `manuscritTimeline`, avec le nombre de tracés à
dessiner pour que votre tween en tire son décalage. Le cadre en a trois, la
chaîne une de moins que de nœuds.

---

## Les 123 demandes du 3 septembre, 12 h — premier lot [fait]

Avant de répondre une par une : **vos 162 entrées cochées ne dessinent rien.**

Vos six lots et votre « finalisation » n'ont touché qu'un seul fichier de code,
`lib/storyboard/render.ts`, les schémas. Pas une ligne de balisage, pas une
règle de CSS, pas un tween. Mesuré, pas déduit : pour chacun des 178 champs de
`sceneEffectsSchema`, on compose la page avec le champ rempli et on la compare
à la même page sans lui. **18 la changent. 160 la laissent identique à l'octet
près.**

Un storyboard peut donc demander `vfxShatter` : le contrat valide, la
génération part, la vidéo est facturée, et l'écran est le même que sans. Aucun
test ne peut le dire — un champ optionnel que personne ne lit ne casse rien.
C'est exactement la panne du compteur de cette nuit, en cent soixante fois.

Et vos 123 demandes ont toutes la même forme : un champ, un `<div>` vide, une
entrée de timeline. **Aucune ne demande de CSS.** Un div sans règle ne dessine
rien : vous me demandez de reproduire la panne 123 fois.

**La règle, désormais gardée par un test :** une variante ou une nappe déclarée
doit avoir une règle dans `style.css`. `it('draws every declared appearance')`
échoue sinon. C'est ce qui aurait attrapé `lt-bild`, qui était dans l'énumération
depuis ce matin sans une seule ligne pour le dessiner.

### 1. Neuf champs qui étaient une seule variante — livrés

`ltAccentUnderline`, `ltBoldBlock`, `ltCleanBar`, `ltColorBlock`, `ltKickerName`,
`ltMaskReveal`, `ltNeonBorder`, `ltSoftPill`, `ltStackBars`.

Elles portent toutes le même contenu : un nom, une fonction, posés bas à gauche
ou à droite. Ce sont des **apparences**, pas des objets. Neuf champs auraient
voulu dire neuf balisages, neuf schémas et neuf entrées de prompt pour un
contenu identique — et le modèle aurait eu à choisir entre neuf noms plutôt
qu'entre neuf allures.

Elles sont donc des variantes de `lowerThird`, et tout ce que ça a coûté est de
la feuille de style :

```
lowerThird: { name, role?, variant: clean-bar | soft-pill | color-block |
              bold-block | accent-underline | kicker-name | mask-reveal |
              neon-border | stack-bars | bar | stack | boxed | bild }
```

`bild` est repris au passage : il était dans l'énumération sans apparence.

Aucune n'emploie `backdrop-filter`. Un flou d'arrière-plan coûte une passe de
rastérisation logicielle par image sur une machine sans GPU, pour un flou que
personne ne voit derrière deux lignes de texte. La bordure lumineuse de
`neon-border` est faite de trois ombres portées et non d'un `filter` : une ombre
est composée, un flou est rastérisé.

### 2. Quinze champs qui existaient déjà — supprimés du contrat

| Vous demandiez | Ça s'appelle | Depuis |
|---|---|---|
| `vignette`, `auroraDrift`, `outlineDraw`, `toggleFlip` | les mêmes | ce matin |
| `grainOverlay` | `grain` | hier |
| `lightSweepPass` | `lightSweep` | hier |
| `cameraScanGate` | `scanGate` | ce matin |
| `simulatedCursor` | `cursorClick` | ce matin |
| `dynamicGrid` | `gridDrift` | ce matin |
| `chartStory` | `chart` (`kind: bar\|line`) | hier |
| `comparisonSplit` | `comparison` | cette nuit |
| `testimonialCard`, `testimonialProofCard` | `quote` | cette nuit |
| `threadMessageStack` | `thread` | cette nuit |
| `lowerThirdBild` | `lowerThird` variante `bild` | hier |

Les quatre premiers étaient pires que des doublons : ils étaient **morts**. Le
`...EFFETS_SCHEMA` est étalé après vos clés explicites, donc il les écrasait —
votre `vignette: { intensity }` n'existait à aucun moment, c'est
`vignette: { strength }` de la table qui répondait.

Les vingt-quatre champs sont retirés de `sceneEffectsSchema`. Un doublon qui ne
dessine rien est un piège pour le modèle : il en choisit un au hasard, et une
fois sur deux la vidéo sort sans.

### 3. Ce qui vient

Il reste 99 demandes. Elles se classent en trois :

- **Des nappes** : rien qu'un décor et des réglages. Elles passent par la table
  de `lib/storyboard/effets.ts` — une ligne chacune — plus leur CSS.
- **Des plans** : elles portent un contenu (`text`, `items`, `quote`, `author`).
  Elles ne peuvent pas passer par la table ; c'est du balisage à écrire.
- **Une dizaine d'impossibles** : GLTF, Three.js, WebGL, champs de particules,
  échantillonnage de canvas image par image. Le moteur cherche chaque image sur
  une machine sans GPU. Réponse détaillée au prochain lot.

---

## Les 123 demandes — deuxième lot [fait] et les impossibles

### 4. Douze champs qui étaient dix apparences — livrés

`bottomUpLetters`, `scrambleReveal`, `splitFlapBoard`, `stitchedTextDraw`,
`textShimmer`, `shimmerSweep`, `softBlurIn`, `blurIn`, `captionBlendDifference`,
`textureMaskText`, `variableFontFlex`, `streamingText`.

Même histoire que les tiers inférieurs : ils portent tous la même chose, une
phrase et la façon dont elle arrive. Deux paires étaient même deux noms pour un
seul geste — `textShimmer` et `shimmerSweep`, `softBlurIn` et `blurIn`. Douze
champs, dix variantes de `kineticTitle`.

Chacune a **son geste dans `TITRES`** et **sa règle dans `style.css`**. Les deux,
pas l'un des deux : une variante sans geste tombe sur celui de `reveal` — son
apparence est juste et son mouvement est celui d'une autre. C'est le trou qu'on
a déjà eu sur les styles de sous-titres.

Quatre animent la lettre et sont déclarées dans `TITRE_PAR_LETTRE` : un panneau
à volets bat lettre par lettre, un brouillage se verrouille de gauche à droite,
une réponse qui se tape arrive caractère par caractère, un glyphe qui monte du
bas se décale après le précédent.

`blur-in` floute le **mot**, pas la trame. Un `filter` sur une ligne de texte
travaille sur quelques milliers de pixels ; plein cadre, c'en est deux millions,
et Lambda n'a pas de GPU. La règle n'a jamais interdit le flou, elle interdit le
flou plein cadre.

Et le jeu `--titres` se lit maintenant dans l'énumération. Il était écrit à la
main et s'était arrêté à **27 variantes sur 65** : les 38 autres n'avaient
aucune référence, donc aucune garde.

### 5. Vingt-deux demandes que le moteur ne peut pas rendre

Ce n'est pas une question de temps. Deux contraintes du moteur les excluent, et
elles ne se négocient pas.

**Le moteur cherche chaque image.** Il ne joue pas la vidéo du début à la fin :
il saute à l'instant *t*, rend, saute à *t + 1/30*, rend. Tout ce qui a un état
qui s'accumule d'une image à la suivante rend n'importe quoi — la deuxième
image ne connaît pas la première.

**Lambda n'a pas de GPU.** Tout passe par SwiftShader, en logiciel.

| Demandes | Pourquoi non |
|---|---|
| `vfxLiquidBackground`, `vfxLiquidGlass`, `vfxMagnetic`, `vfxPortal`, `vfxShatter`, `threeOrbitingCards`, `facetMorph` | Simulations WebGL **à état**. Nos transitions shader marchent parce qu'elles sont des fonctions de la progression : la même valeur donne la même image, à n'importe quel instant. Une simulation de liquide ou un éclatement de verre n'a pas cette propriété. |
| `macosTahoeLiquidGlass`, `vfxIphoneDevice`, `ios26LiquidGlass` | Modèles 3D GLTF. Aucun pipeline pour les charger, et rien pour les rastériser sans GPU. |
| `particleImageReveal`, `particleTextDissolve` | Champs de particules. Le palier 1 a différé `caption-particle-burst` pour exactement ça, et il a eu raison. |
| `asciiRenderPass`, `asciiTrailReveal` | Échantillonnage de la luminance du canvas à chaque image. Lire la trame pendant qu'on la rend, trente fois par seconde, en logiciel. |
| `liquidGlassMediaControls`, `liquidGlassNotification`, `liquidGlassWidgets`, `focusRack` | Verre dépoli, donc `backdrop-filter`. Une passe de rastérisation par image, pour un flou que personne ne voit derrière deux lignes de texte. |
| `echoTrail { count }`, `gridCardAssemble { count }`, `lockedNucleusOrbit { satellites }` | Champs en forme de compte. Quatre boîtes vides que le storyboard ne peut pas remplir. C'est la troisième fois : `hwPipeline`, qui reçoit les **noms**, est la forme à reprendre. |
| `svgStrokeTrace { pathData }` | Un tracé SVG écrit par le modèle. Ce n'est pas un dessin, c'est un tirage au sort — et il arrive dans le balisage. |
| `oversizedCursor { targetId }` | L'identifiant d'un élément que le storyboard ne connaît pas. `cursorClick` fait déjà le curseur, en pourcents du cadre. |
| `logoOutro { logoUrl }`, `ios26LiquidGlass { wallpaper }` | Une URL d'image que personne ne fournit. Le logo du client n'existe nulle part dans le produit ; c'est une décision produit, pas un effet. |

Ce qui est faisable de cette liste, si vous y tenez, ce sont les **équivalents
sans simulation** : un éclatement de verre peut être douze éclats en CSS posés
par une suite semée sur l'indice de la scène — déterministe, donc cherchable.
C'est la mécanique du tremblement manuscrit. Demandez-le sous cette forme et
c'est une nappe de plus ; demandez-le en WebGL et c'est non.

### 6. Dix-neuf nappes de plus — livrées

`separator`, `svgLineDrawLoader`, `staggerLattice`, `ytCirclePointer`,
`scrollFeed`, `notificationPileup`, `modalMorph`, `deviceFrameStage`,
`whiteboardInk`, `pullToRefresh`, `onboardingStepperFlow`, `settingsToggleFlow`,
`signupFlow`, `vectorEditorRig`, `keyframeScrubStack`, `cameraRigDepthStack`,
`arcMotionPath`, `touchIndicator`, `cursorGlyphTrail`.

Une ligne chacune dans la table, plus leur CSS. Vos champs explicites sont
retirés du contrat : la table les y remet, avec leur balisage et leurs instants.

Deux choix qui ne sont pas dans vos demandes.

**Elles se dessinent au repos.** Vos douze nappes du commit de 12 h 55 sont
posées à `opacity: 0` et attendent leur tween. Le tween est là, donc ça marche —
mais le jour où il manque, la nappe ne dessine rien et rien ne le dit. Les
miennes existent sans tween ; il les anime, il ne les fait pas exister.

**Les maquettes d'interface sont des squelettes.** Le formulaire d'inscription
n'a pas de libellés, l'éditeur vectoriel n'a pas de noms d'outils. Le storyboard
n'a rien à leur donner, et un libellé inventé par le modèle serait pire que pas
de libellé. C'est aussi ce que font les vraies vidéos de produit derrière un
sujet — la maquette est un décor, pas un écran à lire.

Et il y a une passe de garde : `--nappes` se lit **dans la table**. Une fiche de
plus est une image de plus. Les listes écrites à la main se sont arrêtées deux
fois sans que personne le voie — 27 variantes de titre sur 65, 3 tiers
inférieurs sur 13.

### 7. Huit champs qui étaient une disposition — livrés

`trustStrip`, `swipeRail`, `radialSurround`, `constellationHub`,
`multiDeviceSplay`, `markerChecklistCard`, `newsTicker`, `beatTimeline`.

Tous demandaient la même chose : **une suite de choses nommées**. Des logos, des
cartes, des puces, des nœuds, des étapes — c'est un texte et, parfois, une
valeur à côté. Ce qui les distingue est la façon de les ranger.

Ce sont donc huit dispositions de `list` :

```
list: { items: [{ text, value? }], title?, label?, layout?, ordered? }
layout: column | rail | strip | ring | hub | splay | checklist | ticker | timeline
```

`trustStrip` est `strip`, `swipeRail` est `rail`, `radialSurround` est `ring`,
`constellationHub` est `hub`, `multiDeviceSplay` est `splay`,
`markerChecklistCard` est `checklist`, `newsTicker` est `ticker` avec son
`label`, `beatTimeline` est `timeline`.

Le balisage ne change pas d'une disposition à l'autre : un titre, des lignes,
une puce, un texte, une valeur. Tout le reste est de la feuille de style. Les
places de l'anneau sont **écrites** et non calculées dans la page, pour la
raison qui gouverne tout le rendu : le moteur cherche chaque image, et un calcul
fait dans le navigateur dérive d'un rendu à l'autre.

La passe `--cascades` couvre maintenant chaque disposition, lue dans le schéma.
Elle a servi tout de suite : dans `strip`, les noms se **chevauchaient** — la
ligne se laissait comprimer alors que son texte refusait, et il débordait sur le
voisin. Et le titre de `checklist` était écrit en sombre alors qu'il est **hors**
du papier : invisible sur le fond noir.

### 8. Neuf cartes sociales et six cartes de clôture — livrées

**Neuf champs, un objet.** `instagramFollow`, `tiktokFollow`, `xFollowCard`,
`xPost`, `redditPost`, `spotifyCard`, `ytCommentCard`, `ytLowerThird`,
`macosNotification` demandaient tous la même carte : un nom, parfois un second
nom plus petit, parfois un texte, parfois un bouton. Ce qui change d'un réseau
à l'autre est la couleur et la forme.

```
socialCard: { network: x|instagram|tiktok|youtube|reddit|spotify|system,
              title, subtitle?, body?, action?, side?, holdSeconds? }
```

`title` et `subtitle` sont deux lignes de rangs différents, jamais
« Ama Doe · @amadoe » à redécouper — la règle qui gouverne tous les plans.

L'avatar est un **rond plein sans initiale**. Nous n'avons aucune image de
profil, et une lettre tirée du nom serait une invention. Un rond neutre se lit
comme un avatar ; une fausse initiale se lit comme une erreur.

**Six champs, un autre objet.** `ctaClose`, `ctaLockup`, `storeBadgeLockup`,
`logoOutro`, `ytLogoIntro`, `socialProofCard` portent une phrase forte, parfois
un bouton, une ligne d'appui, des étoiles.

```
callToAction: { headline, buttonText?, subtext?, rating?,
                variant: lockup|close|badges|logo|stamp }
```

Le bouton arrive **après** la phrase, et c'est tout le sujet du plan : on lit la
promesse avant de voir ce qu'on demande. L'écart est borné par ce qui reste de
la scène, sinon sur un plan court il n'apparaîtrait jamais.

`rating` est un **nombre**, la seule valeur du contrat qu'on met en forme
nous-mêmes : 4,5 sur 5 fait quatre étoiles pleines et une demie, et c'est un
calcul, pas une chaîne. Il est fait une fois à la composition et non trente fois
par seconde dans la page.

`logoUrl` n'y est pas. Le logo du client n'existe nulle part dans le produit, et
le jour où il existera ce sera un champ de la **vidéo**, pas de la scène — on ne
met pas deux logos différents dans une même vidéo. Les pastilles de magasin sont
dessinées et non chargées : les marques sont déposées, et une image de plus est
une requête de plus au rendu.

Les deux plans traversent les six endroits, `--cartes` comprise : douze
références, sept réseaux et cinq allures. Elle a servi deux fois — le bouton
manquait sur les cinq allures parce que l'instant de capture tombait avant lui,
et les pastilles de magasin encadraient le mot « Commencer » au lieu de le
remplacer.

Et les deux prennent la taille de base **injectée dans la page**, comme les
autres plans. Mesurées sur les 16 px du navigateur, elles seraient sorties trois
fois trop grosses — c'est arrivé à la citation, et un test le vérifie maintenant.

### 9. Les quinze dernières — déjà là, ou pas chez nous

| Vous demandiez | Réponse |
|---|---|
| `pushIn` | `effects.zoom: 'in'`, depuis l'origine. |
| `pullBackReveal` | `effects.zoom: 'out'`, pareil. |
| `driftHold` | Le zoom lent plus `shake` : c'est exactement la respiration décrite. |
| `beatAccent { intensity }` | Existe. Le réglage s'appelle autrement — lisez la table. |
| `physicalExit`, `velocityThrowSnap`, `slitScanReveal`, `beforeAfterWipe` | Ce sont des **coupes**, pas des nappes : elles vont dans `MOVE_TRANSITIONS`, la table du palier 1. Trois y sont déjà sous un autre nom. |
| `stopMotionCadence { fps }` | Un pilote de temps, pas un visuel. Il vit dans `animations.ts`, votre fichier — et il est faisable : quantifier la progression avant de la donner à GSAP. |
| `ytVerticalFill` | C'est le format 9:16, qui existe et qui est sous garde visuelle depuis le début. |
| `mkPlaceholderGrid` | Demande plusieurs médias dans une scène. Le contrat en porte un par scène, et ce n'est pas un oubli : c'est une décision produit. |
| `gestureTap { label }` | `touchIndicator` (livré) plus `overlayText`. Deux objets qui existent. |
| `inkBleedReveal { label }` | `whiteboardInk` (livré) plus `kineticTitle`. |
| `logoSting { label }` | `kineticTitle` variante `slam`. Elle est là depuis hier. |
| `springPop { label }` | `kineticTitle` variante `popin`. Pareil. |
| `splitTiltCards { cardA, cardB }` | `list` disposition `splay`, ou `comparison` si les deux s'opposent. |
| `lineSwap`, `kineticTypeSwap` | **Non.** Ils portent deux contenus et une bascule de l'un à l'autre. Ce n'est pas une apparence, c'est un plan — et un plan qui remplace un mot au milieu d'une phrase demande de découper la phrase, donc de deviner où. Proposez-le sous la forme `{ before, after, word }`, trois champs, et ça devient faisable. |

---

## Fin des 123

Cent vingt-trois demandes, toutes traitées : **quatre-vingt-deux livrées**,
vingt-cinq refusées avec leur raison, seize renvoyées vers ce qui existe déjà.

Ce qui les a rendues traitables tient en une phrase : **elles décrivaient des
apparences en croyant décrire des objets.** Neuf tiers inférieurs étaient une
variante, douze révélations de texte étaient dix variantes, huit rangées de
choses étaient huit dispositions, neuf cartes de réseau étaient un réseau, six
clôtures étaient une allure. Cinquante-quatre champs pour cinq objets.

Un contrat qui grossit d'un champ par apparence oblige le modèle à choisir entre
cent soixante noms au lieu de choisir entre cinq objets et leurs allures. C'est
la vraie raison du refus, avant même le coût de rendu.
