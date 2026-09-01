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
décodage matriciel, particules, dégradé, changement de graisse. Notre `.word`
actuel en est la version la plus sobre.

**Le travail** : lire `storyboard.subtitleStyle` dans `sceneMarkup()` et
brancher une classe CSS par valeur. Aucune migration, aucun champ nouveau, et
une promesse déjà faite en base qui devient vraie.

### Palier 2 — un champ de plus dans `sceneRenderSchema`

Le contrat de rendu vit dans une colonne `jsonb` précisément pour que
l'étendre soit un déploiement et non une migration (`lib/storyboard/render.ts`).

Y entrent naturellement :

- **Les 23 transitions CSS et GSAP** des treize packs `transitions-*` — flou
  directionnel, volet, balayage d'horloge, chute, poussée élastique, zoom
  traversant. Elles s'ajoutent à `TRANSITIONS` sans toucher aux shaders, et ne
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

### Lot 2 — Les transitions sans WebGL  ·  palier 2

**Ce qui sort** : 23 transitions de plus dans `TRANSITIONS`, en CSS et GSAP.

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

### Lot 3 — Les incrustations et les compteurs  ·  palier 3, pas 2

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

**Bloqué par** : une décision produit sur ce que le storyboard doit savoir
décrire.

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

---

## Une exclusion découverte au rendu

**Les shaders et les transitions par transformation ne se mélangent pas dans une
même vidéo.**

`HyperShader.init()` prend la main sur la visibilité des scènes : il ne garde
visible que la paire de sa propre couture et cache tout le reste. Une poussée a
besoin des deux scènes à l'écran pendant qu'elles bougent — avec le compositeur
installé, la sortante disparaît et la poussée ne pousse qu'une bande noire.

La composition n'installe donc le compositeur que si la vidéo demande vraiment
un shader. Dans une vidéo qui en contient un, les transformations retombent en
coupe franche.

**Ce que le produit doit en faire reste ouvert** : refuser le mélange à
l'écriture du storyboard, choisir une famille par vidéo, ou laisser la coupe
franche comme repli silencieux. C'est une règle produit, pas une contrainte
technique de plus.

---

## Ce qui reste hors de portée

Filmer soi-même, ou déposer une vidéo pour la faire monter. Le registre a le
skill qui va avec — `talking-head-recut`, qui habille un entretien existant de
cartes graphiques minutées — mais recevoir des fichiers clients demande une
capacité serveur que nous n'avons pas aujourd'hui. À reprendre quand elle
existera.
