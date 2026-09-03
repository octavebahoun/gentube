# Récapitulatif — palier 3

**3 septembre 2026.** Ce que le palier 3 a livré, ce qu'il a trouvé en chemin,
ce qui reste, et ce qui n'est pas prouvé.

---

## 1. Ce qui a été livré

Six plans dont le contenu est une **donnée** et non un texte rédigé. Aucun ne
génère d'image : sur une minute facturée 400 FCFA de fournisseur, un plan de ce
type en coûte dix. C'est la marge la plus haute du catalogue.

| Plan | Ce qu'il porte | Vérifié par |
|---|---|---|
| `counter` | une valeur, un format | `--update` (existait) |
| `lowerThird` | un nom, une fonction | `--tiers` |
| `chart` | une série, en barres ou en courbe | `--graphiques` |
| `thread` | des répliques, deux côtés | `--fils` |
| `quote` | une phrase, un nom, un titre | `--citations` |
| `list` | des lignes et leurs valeurs | `--cascades` |
| `comparison` | deux colonnes en face-à-face | `--cascades` |

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

**Les plans structurés se mesuraient sur le navigateur, pas sur la trame.** La
citation sortait trois fois trop grosse. Ils prennent maintenant une taille de
base injectée dans la page comme celle des sous-titres, en fraction de hauteur.

**Le `* { margin: 0; padding: 0 }` écrase aussi la hauteur de ligne.** Sans
hauteur posée, le nom passait par-dessus la dernière ligne de la citation.

---

## 3. Ce qui n'est pas prouvé

**`beatAccent` n'est pas sous garde visuelle.** Six pour cent d'échelle sur un
aplat dégradé ne se distinguent pas d'un aplat dégradé, et nos quatre fonds de
référence n'ont aucun détail. La donnée est dans la timeline, le tween est
déclaré, la mécanique est celle de l'éclair — qui, elle, est prouvée. **C'est
un trou, pas une validation.** Une cinquième image de fixture avec du détail —
une grille, un motif — le fermerait.

**Les huit nouveaux styles de sous-titres n'ont pas d'entrée dans `MOTS`.** Le
`pgEnum` est ouvert et les classes CSS existent ; sans entrée de tween, le
style tombe sur le repli `karaoke`. L'apparence est juste, le geste est celui
d'un autre. C'est au palier 1.

**Aucun rendu complet n'a été fait de bout en bout** avec un de ces plans dans
une vraie vidéo — seulement des captures d'instants. Le premier qui monte une
vidéo entière avec un `chart` ou un `thread` verra des choses que la garde ne
voit pas.

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

---

## 6. Ce qui reste

**Du palier 3 : 293 entrées sur 373 dans le catalogue entier**, dont l'essentiel
demande une décision produit et non du code — les cartes géographiques
(`us-map-flow`, `nyc-paris-flight`), les maquettes d'interface, les quatorze
`code-snippet-*`, les terminaux.

État à jour, entrée par entrée, avec un filtre « Reste seulement » :
<https://claude.ai/code/artifact/7cfe7d76-6dc7-4497-879c-2708f4360c6a>

**Le plus proche à prendre**, parce qu'il ne demande aucune notion nouvelle :

- `number-wheel` — un chiffre qui roule ; même contenu que le compteur, autre
  mécanique.
- `notes-reveal` / `notes-typing` — le mot tapé dans une application de notes.
  Un `thread` à une seule voix.
- `typing-indicator` — les trois points du fil. Un booléen sur le dernier
  message, et le fil respire.
- La position et l'emphase d'`overlayText` — le seul reste du lot 3 qui ne
  demande aucune décision.

---

## 7. L'état du dépôt

Cinq commits sur `ai-video-saas`, **non poussés** :

```
b42c05d  Une liste et une comparaison — les deux formes qu'on n'avait pas
a0d4649  Une citation, et deux mensonges de mise en page
2e85a49  Un fil de discussion, et deux fichiers dégonflés avant d'y toucher
9bda458  Huit styles de sous-titres, et la migration que ça coûte
b9517c3  Les trois effets du palier 2 traversent enfin le contrat
```

Plus, plus tôt dans la journée : le lot 2 (23 transitions), le tiers inférieur,
et le graphique.

**542 tests, 34 fichiers.** 23 instants visuels pour les seuls plans
structurés, sur 137 références au total.

Un avertissement qui vaut pour la revue : les trois agents ont travaillé dans
**un seul répertoire de travail**, sans worktree. Des modifications du contrat
se sont retrouvées dans des commits d'un autre palier qui ne les mentionne pas.
Rien n'est perdu, mais l'historique ment par endroits.
