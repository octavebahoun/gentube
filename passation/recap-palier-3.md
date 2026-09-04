# Récapitulatif — palier 3

**3 septembre 2026, 12 h 40.** Ce que le palier 3 a livré, ce qu'il a trouvé en
chemin, ce qui reste, et ce qui n'est pas prouvé.

---

## 1. Ce qui a été livré

Huit plans dont le contenu est une **donnée** et non un texte rédigé. Aucun ne
génère d'image : sur une minute facturée 400 FCFA de fournisseur, un plan de ce
type en coûte dix. C'est la marge la plus haute du catalogue.

| Plan | Ce qu'il porte | Vérifié par |
|---|---|---|
| `counter` | une valeur, un format | `--update` (existait) |
| `counter` variante `wheel` | la roue mécanique | `--roue` |
| `lowerThird` | un nom, une fonction | `--tiers` |
| `chart` | une série, en barres ou en courbe | `--graphiques` |
| `thread` | des répliques, deux côtés | `--fils` |
| `quote` | une phrase, un nom, un titre | `--citations` |
| `list` | des lignes et leurs valeurs | `--cascades` |
| `comparison` | deux colonnes en face-à-face | `--cascades` |

Plus la position et l'accent d'`overlayText`, et un **rendu complet de bout en
bout** : dix scènes, 50,5 s, en SwiftShader local — `render/demo/palier-3.ts`.

Chacun traverse les six endroits qu'un plan de palier 3 doit traverser : le
schéma (`lib/storyboard/plans.ts`), le balisage (`lib/render/structures.ts`),
les instants (`lib/render/plans-timeline.ts`), le tween
(`lib/render/contenus.ts`), le prompt système **et** le schéma qui relit le
modèle (`lib/storyboard/service.ts`), et une passe de garde visuelle.

**La règle qui les gouverne tous : un champ par information, jamais une chaîne
à redécouper.** « Kofi Mensah, agronome » dans un seul champ oblige la page à
deviner laquelle des deux lignes grossir, et elle devine mal dès la première
virgule.

---

## 2. Ce qui a été trouvé en chemin

Aucune de ces pannes n'a été trouvée par un test. Toutes l'ont été à l'image.

**Le compteur n'arrivait jamais jusqu'à la base.** Ni `counter` ni les autres
plans structurés n'existaient dans `llmSceneSchema`. Le prompt système les
décrivait depuis des semaines, le modèle pouvait les écrire, et `parse` les
jetait en silence. Une scène chiffrée rendait une image ordinaire — et la
facturait.

**Le prompt visuel était obligatoire.** `llmSceneSchema` exigeait dix
caractères de `prompt` alors que le prompt système dit qu'une scène qui se
dessine seule n'en a pas besoin. Le modèle obéissait, et la génération entière
échouait sur le plan le moins cher du catalogue. La contrainte est devenue
conditionnelle.

**Le graphique se serrait dans un dixième du cadre.** Le conteneur portait
`chart-bar` comme modificateur de type, et chaque colonne aussi : il héritait
de la largeur d'une barre. L'anneau du compteur avait eu exactement la même,
sous le même nom partagé.

**Les pastilles de la courbe étaient des taches.** Des `<circle>` dans un SVG
étiré au cadre s'étirent avec lui. Ce sont maintenant des éléments HTML posés
en pourcentage, et la projection est partagée par le balisage et la timeline
pour qu'ils ne dérivent pas l'un de l'autre.

**La courbe se brisait en tirets détachés.** `stroke-dasharray` avec
`vector-effect="non-scaling-stroke"` se calcule en pixels écran, après
l'étirement du SVG : aucune longueur mesurée dans le repère du tracé ne peut
coller. Elle se découvre maintenant par un `clip-path`, qui ne dépend d'aucune
longueur.

**Les plans structurés se mesuraient sur le navigateur, pas sur la trame.** La
citation sortait trois fois trop grosse. Ils prennent maintenant une taille de
base injectée dans la page comme celle des sous-titres, en fraction de hauteur.

**Le `* { margin: 0; padding: 0 }` écrase aussi la hauteur de ligne.** Sans
hauteur posée, le nom passait par-dessus la dernière ligne de la citation.

**La courbe émettait des tweens de barres.** `bars` était construit aussi pour
`kind: 'line'`, visant des `#b<n>` inexistants ; GSAP le signalait à chaque
rendu. Une garde qui crie pour rien finit par ne plus être lue.

**Et les points de la courbe ne tombaient pas sous leur nom.** L'axe range ses
libellés en colonnes égales ; la série s'étalait, elle, de 0 à 100 % du cadre.
Le premier point se posait au bord gauche du tracé pendant que son libellé
restait au sixième. Ils tombent maintenant au centre de leur colonne,
`(i + 0,5) / n`, et le `gap` de l'axe est devenu une marge intérieure — un
`gap` décalait les centres d'une fraction qui dépendait de la taille du texte.
Le volet passe du même coup à vitesse constante : les pastilles s'allument à
intervalles réguliers, et un `power2.inOut` les laissait s'allumer dans le vide
dès quatre points.

---

## 3. Ce qui n'est pas prouvé

**`beatAccent` n'est pas sous garde visuelle.** Six pour cent d'échelle sur un
aplat dégradé ne se distinguent pas d'un aplat dégradé, et nos quatre fonds de
référence n'ont aucun détail. La donnée est dans la timeline, le tween est
déclaré, la mécanique est celle de l'éclair — qui, elle, est prouvée. **C'est
un trou, pas une validation.** Une cinquième image de fixture avec du détail —
une grille, un motif — le fermerait.

C'est le seul qui reste. Les deux autres sont fermés : le rendu complet a été
fait (§1), et les huit styles de sous-titres ont maintenant leur entrée dans
`MOTS` — c'est le palier 1 qui l'a posée. `cinematic` n'en a toujours pas, et
c'est voulu : il est court-circuité avant la table, parce qu'il révèle la ligne
entière et non les mots un par un.

---

## 4. Ce que le palier 3 a fait pour les autres

Il possède `render.ts` et `service.ts`, donc il applique les demandes des deux
autres paliers. Voir [`reponses.md`](reponses.md) pour le détail.

- Trois effets du palier 2 branchés au contrat : `lightSweep`, `grain`,
  `beatAccent`.
- Quatre variantes de titre du palier 1.
- Huit styles de sous-titres, qui ont demandé une **migration** — le style de
  sous-titre est le seul morceau du vocabulaire de rendu qui vive en base.
  Appliquée sur le distant, 11 sur 11.
- **Neuf nappes de plus, par une table plutôt qu'à la main**
  (`lib/storyboard/effets.ts`) : `vignette`, `shockRing`, `featherSpot`,
  `gridDrift`, `auroraDrift`, `scanGate`, `outlineDraw`, `toggleFlip`,
  `cursorClick`. Le schéma, le balisage et la timeline se lisent tous les trois
  dans cette table ; ajouter un effet est une ligne.
- **La famille manuscrite** (`lib/render/manuscrit.ts`) : `hwBoil`,
  `hwBoxLabel`, `hwCalloutCircle`, `hwFrame`, `hwPipeline`. Elle est à part de
  la table parce qu'elle porte un **contenu** — un libellé, des nœuds nommés —
  là où une nappe n'a que des réglages. Le tremblement est semé sur l'indice de
  la scène : tiré au hasard, il donnerait un trait différent à chaque image, et
  le moteur cherche chaque image ; le trait grouillerait au lieu de trembler.

**Deux refus, motivés dans `reponses.md`.** `motionBlur` : un flou plein cadre
triple le temps de rendu en rastérisation logicielle, c'est un invariant du
dépôt et non une préférence. Et sept champs en forme de compte —
`flowchart { nodesCount }`, `mkSpecsList { itemsCount }`, `badgeMatrix { rows,
cols }`… — qui dessinent des boîtes vides que le storyboard ne peut pas
remplir. `hwPipeline`, qui reçoit les **noms** des nœuds, est la forme à
reprendre pour eux ; ce sont des plans de palier 3, pas des effets.

Et une panne qui n'appartenait à personne : les trois agents testaient sur la
même base locale, qui se tronque entre chaque test. Quatorze échecs sans aucune
ligne de code en cause. `TEST_DATABASE_URL` par agent, c'est au §5.1 du README.

---

## 5. Les fichiers, et pourquoi ils ont bougé

La règle est de 500 à 600 lignes par fichier, et d'extraire **au fur et à
mesure** plutôt que de laisser gonfler. Quatre coupes, toutes faites *avant*
d'ajouter, jamais après :

| Fichier | Avant | Après | Ce qui est parti |
|---|---|---|---|
| `lib/render/markup.ts` | 516 | 341 | `structures.ts` — le balisage des plans |
| `lib/storyboard/render.ts` | 880 | 795 | `plans.ts` — leurs schémas |
| `lib/render/plan.ts` | 689 | 491 | `plans-timeline.ts` — leurs instants |
| `lib/render/animations.ts` | 202 | 147 | `contenus.ts` — leurs tweens |

Chacun garde un réexport de compatibilité : aucun import n'a eu à changer.

La séparation n'est pas esthétique. `animations.ts` anime la scène,
`contenus.ts` dessine ce qu'elle raconte — et c'est ce qui permet au palier 2
de travailler dans le premier pendant que le palier 3 écrit dans le second.

**À reprendre en revue : `lib/storyboard/render.ts` est reparti à 1076 lignes
au dernier commit, et 1745 dans l'arbre de travail.** Trois fois la limite. Le
fichier porte le contrat, donc les trois paliers écrivent dedans, et personne
ne coupe. La coupe naturelle est la même que la première : les schémas d'une
famille partent dans leur propre fichier, comme `plans.ts`.

---

## 6. Ce qui reste

**Tous paliers confondus : 104 entrées restent sur 373.** 214 rendues, 10
partielles, 15 disponibles autrement, 30 impossibles. Relevé le 4 septembre au
soir, **à la mesure** : pour chaque entrée du palier 2, la page est composée avec
le champ rempli puis sans, et les deux sont comparées octet par octet. Aucun état
ne vient d'une coche.

| Palier | Reste | Sur | Rendues | Partielles | Autrement | Impossibles |
|---|---|---|---|---|---|---|
| 1 | 2 | 105 | 101 | 2 | — | — |
| 2 | 19 | 165 | 98 | 3 | 15 | 30 |
| **3** | **83** | **103** | **16** | **4** | — | — |

Trois corrections que la mesure a imposées contre les coches. `motionBlur` était
marqué fait alors qu'il est refusé — un flou plein cadre triple le temps de rendu
en rastérisation logicielle. `hwBoil` est **de nous**, et il est inerte : le
tremblement seul ne change pas la page, même posé à côté de `hwFrame`. Et 45 des
65 variantes de `kineticTitle` n'ont aucune règle de style à elles : elles ont
leur geste, mais l'allure est celle du titre nu. Un `marker` sans trait de
surligneur se lit comme du texte ordinaire.

Du palier 3, l'essentiel de ces 83 demande une décision produit et non du code
— les cartes géographiques (`us-map-flow`, `nyc-paris-flight`), les maquettes
d'interface, les quatorze `code-snippet-*`, les terminaux.

État à jour, entrée par entrée, avec un filtre « Reste seulement » et un bouton
« Impossibles » qui isole les 30 refus, chacun avec sa raison en clair :
<https://claude.ai/code/artifact/87f9a25b-a3e1-429a-9e70-8cd9cde396b0>

L'ancien lien (`7cfe7d76…`) a été supprimé et ne répond plus.

**Le plus proche à prendre**, parce qu'il ne demande aucune notion nouvelle :

- `notes-reveal` / `notes-typing` — le mot tapé dans une application de notes.
  Un `thread` à une seule voix, avec une frappe caractère par caractère.
- `spring-stack-shuffle` — une pile de cartes qui se rebat. Le contenu est une
  liste, la mécanique est neuve.
- `mk-progress-stat` — le compteur avec sa piste de progression linéaire ; on a
  l'anneau, pas la barre.

---

## 7. L'état du dépôt

**27 commits sur `ai-video-saas`, non poussés** — 15 du palier 3, 12 des deux
autres. Ceux du palier 3, du plus récent au plus ancien :

```
25865bb  Les points de la courbe au-dessus de leur nom
8e4a472  La famille manuscrite, et un tremblement qui ne grouille pas
52dc3b8  Neuf nappes du palier 2, par une table plutôt qu'à la main
707569b  Un rendu complet, et la courbe qui visait des barres absentes
321d9b0  Le récapitulatif suit la roue
71c4dd9  La roue, les trois points, et le bandeau qui bouge enfin
c9a9609  Le récapitulatif du palier 3
b42c05d  Une liste et une comparaison — les deux formes qu'on n'avait pas
a0d4649  Une citation, et deux mensonges de mise en page
2e85a49  Un fil de discussion, et deux fichiers dégonflés avant d'y toucher
9bda458  Huit styles de sous-titres, et la migration que ça coûte
b9517c3  Les trois effets du palier 2 traversent enfin le contrat
eec3eed  Un graphique, et le prompt qui refusait les scènes sans image
ce18275  Un nom et une fonction, pas une chaîne à redécouper
85dac20  Dix-sept gestes de plus, et trois qui ne bougeaient pas
```

**558 tests, 34 fichiers.** 137 références visuelles, dont 25 pour les seuls
plans structurés.

Un avertissement qui vaut pour la revue : les trois agents ont travaillé dans
**un seul répertoire de travail**, sans worktree. Des modifications du contrat
se sont retrouvées dans des commits d'un autre palier qui ne les mentionne pas
— et l'épaississement de la courbe est parti dans « Neuf nappes du palier 2 »,
qui ne parle pas de graphique. Rien n'est perdu, mais l'historique ment par
endroits.

---

## 8. Vérification des paliers 1 et 2

**3 septembre 2026, 13 h.** Les deux paliers ont coché leurs listes. Vérifié
dans le code, pas dans les coches.

### Palier 1 — fini

| Vocabulaire | Déclaré | Avec un geste |
|---|---|---|
| `MOVE_TRANSITIONS` | 44 | 44 |
| `SHADER_TRANSITIONS` | 14 | 14 (connus du `vendor/shader-transitions.min.js`) |
| variantes de `kineticTitle` | 55 | 55 dans `TITRES` |
| styles de sous-titres | 9 | 8 dans `MOTS` + `cinematic`, court-circuité avant |

56 entrées cochées sur 57. `caption-particle-burst` est **différé** — rendu de
particules trop lourd sur Lambda, et c'est la bonne décision. Une seule coche
ne tient pas : **`vox-annotate` n'existe nulle part** dans le dépôt, sous aucun
nom. Elle reste au reste dans le catalogue.

### Palier 2 — pas fini le 3, fermé le 4

**Ce qui suit est le constat du 3 septembre.** Les 123 demandes qu'il a
déposées ce jour-là sont closes depuis le 4 au soir : 98 rendues, 3 partielles,
15 disponibles autrement, 30 impossibles avec leur raison, 19 restantes. La
mesure décrite plus bas a été refaite après coup, et c'est elle qui donne ces
chiffres — pas les coches. Le §6 les porte.

162 entrées cochées, et **le rendu n'en dessine aucune.**

Les six lots et la « finalisation » n'ont touché qu'un seul fichier de code :
`lib/storyboard/render.ts`, les schémas. Pas une ligne de balisage, pas une
règle de CSS, pas un tween. Le dernier commit à lui seul ajoute 703 lignes de
contrat et rien d'autre.

Mesuré, pas déduit. Pour chacun des **178 champs** de `sceneEffectsSchema`, on
compose la page avec le champ rempli et on la compare à la même page sans lui :

- **18 changent la page.** `shake`, `flash`, `lightSweep`, `grain`,
  `beatAccent`, les neuf de la table des nappes, les quatre `hw*`.
- **160 rendent une page identique à l'octet près.**

Un storyboard peut donc demander `vfxShatter`, `ltCleanBar` ou `ytLogoIntro` :
le contrat valide, la génération part, la vidéo est facturée, et l'écran est le
même que sans. C'est exactement la panne du compteur au §2, en cent soixante
fois.

Les tests ne le voient pas et ne le verront pas : un champ optionnel que
personne ne lit ne casse rien. **La seule garde qui l'aurait vu est la
comparaison à l'image** — ou ce script de trois lignes.

Ce qu'il reste à faire pour ces 162 est donc l'essentiel du travail : le
balisage, le CSS, le tween et une passe de garde, pour chacune. La table de
`lib/storyboard/effets.ts` est là pour ça — une nappe y est une ligne, et le
schéma, le balisage et la timeline s'en déduisent tous les trois.

Et pour les champs en forme de compte — `flowchart { nodesCount }`,
`metricCalloutGrid { cards }`, `vfxShatter { piecesCount }` — la remarque du §4
tient toujours : ils dessineront des boîtes vides. `hwPipeline`, qui reçoit les
**noms**, est la forme à reprendre.
