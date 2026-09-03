# Brief — agent palier 3

> **Lis `passation/README.md` en entier avant d'écrire une ligne.**

---

## La mission

Palier 3 : **le plan porte du contenu**. Ce ne sont pas des effets. Une scène
ne connaît aujourd'hui qu'un prompt visuel et une narration ; un graphique a
besoin de séries, une carte de trajets, un fil de discussion d'un expéditeur et
d'un message.

Donc le storyboard doit savoir les décrire, donc le modèle doit les produire,
donc `sceneRenderSchema` **et** le prompt système changent ensemble. C'est
pour ça que ce palier possède les quatre fichiers du contrat, et pourquoi les
deux autres agents passent par `passation/demandes.md`.

Il reste **93 entrées** sur les 103 du palier.

---

## Ce que ce palier possède

| Fichier | Pourquoi lui |
|---|---|
| `lib/storyboard/render.ts` | le contrat de rendu, les enums, les durées |
| `lib/storyboard/service.ts` | le prompt système et le schéma qui relit le modèle |
| `lib/render/markup.ts` | le balisage d'un plan |
| `lib/render/plan.ts` | les instants absolus envoyés à la page |
| `lib/render/contenus.ts` | les tweens des plans structurés |

Il a aussi la charge d'appliquer les demandes des paliers 1 et 2, **au fil de
l'eau**. Un agent bloqué sur un enum qu'il ne peut pas éditer perd son
après-midi.

---

## Le chemin déjà tracé

Le tiers inférieur, livré le 3 septembre, est le modèle à suivre. Il montre
les cinq endroits qu'une entrée de palier 3 touche :

1. **`lib/storyboard/render.ts`** — un schéma nommé et exporté
   (`lowerThirdSchema`), branché en optionnel dans `sceneRenderSchema`.
2. **`lib/render/markup.ts`** — une fonction `xxxMarkup(scene, index)` qui
   rend des **éléments séparés**, un par information. C'est tout l'intérêt :
   le CSS ne peut hiérarchiser que ce qui lui arrive séparé.
3. **`lib/render/plan.ts`** — les instants, calculés ici et jamais dans la
   page. Bornés par la fin de la scène.
4. **`lib/render/contenus.ts`** — des `fromTo` à des instants absolus, jamais
   un aller-retour. Ce fichier est appelé par la boucle de `animations.ts` et
   n'anime que les plans structurés : c'est ce qui laisse le palier 2
   travailler dans `animations.ts` sans nous croiser.
5. **`lib/storyboard/service.ts`** — la ligne du prompt système **et** le
   champ dans `llmSceneSchema`. Les deux, sinon le modèle écrit et `parse`
   jette en silence : c'est ce qui est arrivé au compteur, décrit dans le
   prompt depuis des semaines et absent du schéma.

Et le sixième endroit, hors code : une passe dans `render/regression/run.ts`,
avec un instant calculé sur la timeline et pas écrit en dur.

---

## La règle qui décide de tout

**Un champ par information, jamais une chaîne à redécouper.**

`overlayText` porte une chaîne. Un tiers inférieur porte un nom *et* une
fonction. Passer « Kofi Mensah, agronome » dans un seul champ oblige la page à
deviner laquelle des deux lignes grossir, et elle devine mal dès la première
virgule dans un titre. Un `count-up` porte une valeur *et* un format. Un
`data-chart` porte des séries *et* des étiquettes.

Si tu te retrouves à écrire un `split(',')` dans le balisage, le champ est
mal découpé.

---

## Ce qui a le plus de valeur

Un plan de palier 3 **ne coûte aucune image**. Sur une minute facturée
400 FCFA de fournisseur, un plan chiffré en coûte dix. C'est la marge la plus
haute du catalogue, et c'est ce qui rend viable le genre « les cinq chiffres
de… », très courant en contenu sans visage.

`rendersOwnContent()` dans `render.ts` est la fonction qui fait cette
économie : sans elle, l'étape image dessine une illustration pour un écran qui
ne la montrera jamais — et la facture. **Tout nouveau plan structuré doit y
être ajouté.** C'est l'oubli le plus cher possible.

---

## Ce qui est déjà fait

Le compteur (`count` et `ring`), la carte de fin, le tiers inférieur en trois
variantes, et le passage du contenu structuré à travers `llmSceneSchema`.

Le détail entrée par entrée :
<https://claude.ai/code/artifact/7cfe7d76-6dc7-4497-879c-2708f4360c6a>
