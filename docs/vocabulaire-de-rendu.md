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

## L'ordre retenu

1. **`subtitleStyle`**, parce que la promesse est déjà en base et que le coût
   est d'une demi-journée.
2. **Les transitions CSS**, parce qu'elles élargissent le vocabulaire sans
   toucher au coût de rendu ni au prompt.
3. **Les incrustations et compteurs**, parce qu'un plan sans image générée est
   le plan le plus rentable du catalogue.
4. **Les plans structurés**, quand le reste tient.

---

## Ce qui reste hors de portée

Filmer soi-même, ou déposer une vidéo pour la faire monter. Le registre a le
skill qui va avec — `talking-head-recut`, qui habille un entretien existant de
cartes graphiques minutées — mais recevoir des fichiers clients demande une
capacité serveur que nous n'avons pas aujourd'hui. À reprendre quand elle
existera.
