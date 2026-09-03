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
