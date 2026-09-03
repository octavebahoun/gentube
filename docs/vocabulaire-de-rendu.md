# Élargir le vocabulaire de rendu

Arrêté le 1er septembre 2026, après lecture du dépôt
[heygen-com/hyperframes](https://github.com/heygen-com/hyperframes).

GenTube est un éditeur vidéo complet : c'est le prompt du client et ses choix
qui décident du résultat. Le vocabulaire de rendu — ce que la composition sait
dessiner — est donc la limite haute de ce qu'un client peut demander. Ce
document dit comment l'élargir, et dans quel ordre.

---

## Ce que le registre contient

Le registre officiel expose **373 entrées** : 155 blocs et 218 composants.
Chacune est un document HTML autonome, animé par GSAP et minuté par
`data-start` — exactement l'architecture que `lib/render/composition.ts`
génère. Il n'y a ni React, ni étape de compilation : le balisage, le CSS et le
tween se transposent tels quels.

S'y ajoutent **21 skills**, dont `faceless-explainer`, qui décrit en sept
étapes le pipeline « texte → vidéo explicative sans visage » — c'est-à-dire
notre produit, écrit par quelqu'un d'autre.

Installation d'une entrée : `npx hyperframes add <nom>`.

---

## L'axe qui compte

Il ne s'agit pas de trier par pertinence : tout est pertinent, puisque c'est le
client qui choisit. Le seul tri utile est **ce que chaque entrée coûte pour
devenir disponible**, et il donne trois paliers.

### Palier 1 — le champ existe déjà, il est ignoré

`videos.subtitle_style` vaut `karaoke`, `fondant` ou `cinematic` en base. La
composition n'en lit **aucun** : `composition.ts` ne mentionne jamais ce champ,
et toute vidéo sort en karaoké. Trois valeurs promises, une seule rendue.

Le registre offre dix-sept composants `caption-*` — pastille, néon, glitch,
décodage matriciel, particules, dégradé, changement de graisse, etc. Notre `.word`
actuel en est la version la plus sobre.

Les styles de sous-titres intégrés dans GenTube : `karaoke`, `fondant`, `cinematic`, `glitch-rgb`, `editorial-emphasis`, `kinetic-slam`, `matrix-decode`, `parallax-layers`, `texture`, `weight-shift`, `camera-follow`.

Les variantes de titres animés (`TITRES`) supportées : `reveal`, `neon`, `icon`, `pin`, `typewriter`, `tracking`, `cascade`, `slam`, `rise`, `glitch`, `blur-out`, `explode`, `focus`, `lines`, `lockup`, `decode`, `crossfade`, `scan`, `axis-y`, `axis-z`, `reel`, `fade-up`, `strike`, `ticker`, `calm`, `split`, `weight`, `wave`, `backdrop`, `drop`, `handwritten`, `marker`, `marquee`, `brand`.

**Le travail** : lire `storyboard.subtitleStyle` dans `sceneMarkup()` et
brancher une classe CSS par valeur. Aucune migration, aucun champ nouveau, et
une promesse déjà faite en base qui devient vraie.

### Palier 2 — un champ de plus dans `sceneRenderSchema`

Le contrat de rendu vit dans une colonne `jsonb` précisément pour que
l'étendre soit un déploiement et non une migration (`lib/storyboard/render.ts`).

Y entrent naturellement :

- **Les 35 transitions CSS et GSAP** des packs `transitions-*` — flou
  directionnel, volet, balayage d'horloge, chute, poussée élastique, zoom
  traversant, whip-pan-cut, cut-the-curve, grid-pixelate-wipe, rubber-band-bumper, chromatic-wipe, morph-swap, parallax-zoom, parallax-unzoom, page-slide, halftone-dissolve, type-match-cut, match-cut. Elles s'ajoutent à `TRANSITIONS` sans toucher aux shaders, et ne
  coûtent rien de plus au rendu puisqu'elles ne demandent pas de WebGL.
- **Les incrustations** : bandeaux `lt-*`, tiers inférieurs, cartouches de
  citation. `overlayText` existe déjà et n'a qu'une variante.
- **Les compteurs et jauges** : `count-up`, `conic-progress-ring`,
  `number-wheel`. Un chiffre qui monte est le plan le moins cher qui existe —
  aucune image à générer.

**Le travail, par entrée** : un champ optionnel dans `sceneEffectsSchema`, son
balisage dans `sceneMarkup()`, son tween dans la timeline, et une ligne dans le
prompt système pour que le LLM sache qu'il peut le demander.

### Palier 3 — une notion que le produit n'a pas

Cartes de données, cartes géographiques, maquettes d'interface, terminaux,
fils de discussion. Ce ne sont pas des effets : ce sont des **plans dont le
contenu est structuré**, là où une scène ne connaît aujourd'hui qu'un prompt
visuel et une narration.

Un plan `data-chart` a besoin de séries, un `us-map-flow` de trajets, un
`slack-notification-ad` d'un expéditeur et d'un message. Il faut donc que le
storyboard sache les décrire, donc que le LLM les produise, donc que le prompt
système et le schéma de scène les portent.

C'est là que se trouve la vraie extension du produit — et le vrai travail.

---

## Chronologie

Quatre lots, dans cet ordre, parce que chacun lève une contrainte du suivant.

### Lot 1 — Les styles de sous-titres  ·  palier 1

**Ce qui sort** : `videos.subtitle_style` cesse d'être décoratif. Les trois
valeurs déjà en base rendent trois apparences distinctes.

| Étape | Fichier |
|---|---|
| Passer `subtitleStyle` à `sceneMarkup()` et le poser en classe | `lib/render/composition.ts` |
| Écrire les trois apparences | `render/gentube-v1/style.css` |
| Un test par style, sur le HTML rendu | `lib/render/composition.test.ts` |
| Le choix dans l'éditeur | `components/storyboard/` |

**Aucune migration, aucun champ nouveau, aucun appel fournisseur.** C'est le
seul lot qui ne touche ni au prompt système ni au contrat de scène — d'où sa
place en premier : il valide le chemin « registre → composition » sur le cas le
plus simple, avant qu'on l'emprunte avec des enjeux.

**Bloque** : rien. **Bloqué par** : rien.

### Lot 2 — Les transitions sans WebGL  ·  palier 2  ·  **fait le 2 septembre 2026**

**Ce qui sort** : 23 transitions de plus dans `TRANSITIONS`, en CSS et GSAP.

**Livré** : dix-sept gestes de plus, qui portent la famille par déplacement de
six à vingt-trois. Trois sous-familles, et elles ne se lisent pas de la même
façon :

| Famille | Gestes | Ce qui bouge |
|---|---|---|
| Déplacements | `push-down`, `slide-diagonal`, `elastic-push` | les deux scènes |
| Échelles | `fold`, `stretch` | les deux scènes |
| Volets | `wipe-left/right/up/down`, `iris-in`, `box-iris`, `barn-doors`, `curtain`, `clock-wipe` | la découpe de l'entrante seule |
| Bascules | `flip-x`, `flip-y`, `spin` | la rotation de l'entrante |

La contrainte qui a décidé de la moitié des formes : **la scène entrante est
toujours au-dessus dans le document**. Un geste où seule la sortante bougerait
ne se verrait pas, l'entrante la couvrant déjà. C'est pourquoi les volets
découpent l'entrante au lieu d'effacer la sortante, et pourquoi un `iris-out`
— la sortante qui se referme en rond — n'existe pas.

`clock-wipe` est le seul à sortir des transformations : un dégradé conique lit
une variable CSS que GSAP fait tourner de 0 à 360. À 360 le masque est plein,
donc la scène reste entière une fois la coupe passée.

Aucun flou plein cadre : la rastérisation logicielle de Lambda le paie trop
cher. Le flou reste réservé aux mots des titres.

Vérifié par `--transitions`, une capture au milieu de chaque coupe — et cette
vérification a servi. Trois gestes sur vingt-trois ne bougeaient pas du tout :
`fold`, `squeeze` et `stretch` rendaient une scène entière et immobile. Le
socle du tween posait `scale: 1` à côté du `scaleX: 0` de la forme, et GSAP
traite `scale` comme un raccourci qui écrit scaleX **et** scaleY : il écrasait
le geste. Corrigé le 3 septembre 2026 en ne posant au repos que les propriétés
que la forme touche réellement. Les suites unitaires étaient vertes tout du
long — elles voyaient le tween déclaré, pas le pixel.

Elles s'ajoutent à côté des quatorze shaders, pas à leur place. Deux raisons de
les vouloir malgré les shaders : elles ne demandent aucun WebGL, donc elles
rendent partout sans dépendre du drapeau de compositing ; et elles couvrent des
gestes que les shaders ne font pas — volet, balayage d'horloge, poussée
élastique.

Chaque entrée demande son nom dans `TRANSITIONS`, sa durée dans
`TRANSITION_DURATIONS`, son tween dans la timeline, et une ligne dans le prompt
système pour que le LLM sache la demander.

**Bloqué par** : le lot 1, qui aura montré comment on transpose un extrait du
registre sans le recopier bêtement.

### Lot 3 — Les incrustations et les compteurs  ·  palier 3, pas 2  ·  **entamé le 3 septembre 2026**

**Reclassé le 2 septembre 2026, après examen des blocs.** Je les croyais
présentationnels ; ils ne le sont pas.

Un `lt-*` du registre n'est pas une variante d'apparence de notre `overlayText`.
`overlayText` porte **une chaîne** ; un tiers inférieur porte un nom *et* une
fonction, un `count-up` une valeur *et* un format, un `conic-progress-ring` un
pourcentage. Ce sont des plans dont le contenu est structuré — donc le même
problème que le lot 4, à une échelle plus petite.

Ce qui reste faisable sans toucher au contenu, et qui vaut peu : la position et
l'emphase de la ligne existante.

**Ce lot rejoint donc le palier 3**, et son intérêt tient à une chose : un plan
`count-up` ne coûte que sa voix off. Aucun appel à Flux ni à Replicate. Sur une
minute facturée 400 FCFA de fournisseur, un plan de ce type en coûte dix. C'est
la marge la plus haute du catalogue, et elle justifie le travail de contenu.

**Livré le 3 septembre 2026 : le tiers inférieur.** C'est le premier champ du
contrat dont le contenu est *structuré* et non rédigé — `name` et `role`, deux
lignes de rangs différents. `overlayText` n'en porte qu'une, et c'est
exactement ce qui manquait : une seule chaîne obligerait la page à redécouper
« Kofi Mensah, agronome » pour deviner laquelle grossir, et elle devinerait mal
dès la première virgule dans un titre.

Trois variantes — `bar` (filet d'accent), `stack` (sans décor), `boxed`
(cartouche) — un côté, et une sortie : c'est le seul incrusté qui *part* avant
la fin de la scène, borné par elle pour qu'il ne nomme jamais quelqu'un sur le
plan suivant. Aucun `backdrop-filter` : une passe de flou par image coûte trop
cher en rastérisation logicielle pour un bandeau de cette taille.

**Le compteur, lui, existait déjà entièrement** — schéma, balisage, anneau,
timeline, référence visuelle. Ce qui manquait était ailleurs : ni `counter` ni
`lowerThird` n'existaient dans le schéma qui relit la réponse du modèle. Le
prompt système les décrivait, le modèle pouvait les écrire, et `parse` les
jetait en silence. Une scène chiffrée rendait donc une image ordinaire, et
rien ne le disait.

Reste du lot : la position et l'emphase de `overlayText`, et les blocs `lt-*`
qui portent plus que deux lignes.

**Bloqué par** : une décision produit sur ce que le storyboard doit savoir
décrire.

**Le graphique, livré le 3 septembre 2026.** Premier plan dont le contenu est
une **série** : des couples étiquette/valeur, dans l'ordre où l'œil les lit.
Deux formes — `bar` compare des quantités, `line` montre une évolution — et
trois à six points. En dessous, un compteur dit la même chose plus fort ;
au-delà, les étiquettes ne tiennent plus dans un cadre vertical.

Toute la géométrie est calculée hors de la page : les barres arrivent avec leur
fraction de l'échelle, la courbe avec ses points projetés et la longueur de son
tracé. `getTotalLength()` sur un SVG étiré ne rend pas la même valeur selon le
format — ce genre de calcul dans le navigateur dériverait d'un rendu à l'autre.

Deux pannes trouvées à l'image, invisibles pour les tests :

- le conteneur portait `chart-bar` comme modificateur de type, et chaque
  colonne aussi. Le graphique entier héritait de la largeur d'une barre et se
  serrait dans un dixième du cadre. Exactement la panne que l'anneau du
  compteur avait eue avant lui ;
- les pastilles de la courbe étaient des `<circle>` dans un SVG étiré au cadre.
  Étirées avec lui, elles rendaient des taches. Ce sont maintenant des éléments
  HTML posés en pourcentage.

Et un troisième, celui-là dans le contrat : `llmSceneSchema` exigeait un
`prompt` d'au moins dix caractères, alors que le prompt système dit depuis
toujours qu'une scène qui se dessine seule n'en a pas besoin. Le modèle
obéissait, et la génération entière échouait sur la scène qui coûtait le moins
cher. La contrainte est devenue conditionnelle.

Vérifié par `--graphiques`, une capture au milieu de la montée.

### Lot 4 — Les plans structurés  ·  palier 3

**Ce qui sort** : des scènes dont le contenu est une donnée, pas une image —
graphiques, cartes, fils de discussion, maquettes.

C'est un chantier produit, pas une transposition. Une scène ne connaît
aujourd'hui qu'un prompt visuel et une narration ; il faut qu'elle puisse porter
des séries, des trajets, des messages. Donc le storyboard doit les décrire, donc
le LLM doit les produire, donc le prompt système et `sceneRenderSchema`
changent ensemble.

À ne pas commencer avant que les trois premiers lots tiennent : c'est le seul
qui peut casser des storyboards existants.

**Bloqué par** : les lots 1 à 3, et par une décision produit sur ce qu'on vend.

### Lot 5 — Les effets de scène  ·  palier 2  ·  **entamé le 3 septembre 2026**

Trois effets transposés du registre, tween et CSS livrés, schéma demandé au
palier 3 dans `passation/demandes.md` ( tween lit `scene.*`, la timeline ne
le porte pas encore ) :

- `lightSweep` ← `shimmer-sweep` + `light-sweep-pass` : une bande de lumière
  diagonale traverse une fois, calée sur le rythme quand `onBeat` est vrai.
- `grain` ← `grain-overlay` : un voile de bruit qui scintille en yoyo, sans
  aucun flou — le filtre SVG n'est évalué qu'au décodage du fond.
- `beatAccent` ← `beat-accent` : le cadre respire une fois sur le pic le plus
  proche et retombe ; pulse `#s` (et `#m` si hoisted), jamais `#m` d'une image
  où l'échelle du Ken Burns vit déjà.

Vérifiés à l'image par `hyperframes snapshot` au milieu du geste : la bande
est centrée à 1,45 s et partie à 2,5 s, le grain tient toute la scène, le pic
rend le titre 6 % plus grand puis le repose exactement.

---

## Un conflit d'ordre, pas une exclusion

**Les shaders et les transitions par transformation cohabitent.** Il a fallu
trois essais pour le comprendre, et les deux premiers m'avaient fait conclure
l'inverse.

Le moteur cherche chaque image. À chaque image, le compositeur de shaders et
nos tweens écrivent sur les mêmes propriétés — `visibility` et `opacity`. Celui
qui écrit en dernier gagne, et rien d'autre ne départage.

Ce qui échouait, et pourquoi :

- **Couture de durée nulle** : le compositeur saute à l'état d'après et masque
  la scène sortante. La poussée pousse une bande noire.
- **Couture de durée réelle, gestes posés avant l'init** : il pilote l'opacité
  des deux scènes pour son fondu et écrase la nôtre. Cette fois c'est
  l'entrante qui manque.

Ce qui marche : **la couture garde sa vraie durée** — c'est elle qui maintient
les deux scènes vivantes — et **les gestes sont posés après `HyperShader.init()`**,
en réaffirmant `visibility: "visible"`. Une opacité seule ne suffit pas : le
compositeur cache par `visibility`, qu'aucun tween d'opacité ne rallume.

Trois tests tiennent cet ordre, parce qu'il est invisible à la lecture et qu'un
déplacement innocent du bloc le casserait en silence.

---

## Ce qui reste hors de portée

Filmer soi-même, ou déposer une vidéo pour la faire monter. Le registre a le
skill qui va avec — `talking-head-recut`, qui habille un entretien existant de
cartes graphiques minutées — mais recevoir des fichiers clients demande une
capacité serveur que nous n'avons pas aujourd'hui. À reprendre quand elle
existera.
