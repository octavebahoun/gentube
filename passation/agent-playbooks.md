# Brief — agent playbooks

> **Lis `passation/README.md` en entier avant d'écrire une ligne.** Les
> invariants du moteur et la façon de vérifier y sont, ils ne sont pas répétés
> ici.

---

## Ta mission

Un **registre** décide aujourd'hui de trois effets. Il doit décider de tout ce
qui fait le style d'une vidéo : son rythme, ses transitions, sa lumière, ses
couleurs, sa voix.

L'idée vient des *playbooks* d'OpenMontage (`styles/clean-professional.yaml`,
104 lignes de YAML). **Ne recopie pas ce fichier** : le dépôt est en AGPL-3.0
et son code ne peut pas entrer ici. On en reprend la forme et l'intention, avec
nos propres valeurs, dans notre langage.

Sept consignes, indépendantes. Fais-les dans l'ordre : les trois premières
vivent dans le même fichier et se tiennent, les quatre suivantes sont plus
lourdes et peuvent attendre.

---

## L'état actuel

`lib/storyboard/registres.ts` porte une table `FICHES`, un seul registre
(`explainer`), et une fonction `habille(registre, ton, index, total)` qui rend
un `SceneEffects`. C'est tout ce qu'un registre sait faire.

Le reste du style est éparpillé : une constante `STYLE` écrite en dur dans
`render/demo/pipeline.ts`, des ratios de police en dur dans
`lib/render/composition.ts`, des couleurs dans `render/gentube-v1/style.css`.

---

## Ce que tu possèdes

| Fichier | Ce que tu y fais |
|---|---|
| `lib/storyboard/registres.ts` | la table, et elle grossit |
| `lib/storyboard/registres.test.ts` | tes tests |
| `lib/storyboard/prompt.ts` | les lignes dites au modèle |
| un fichier neuf par consigne lourde | voir §4 et §5 |

`registres.ts` fait 190 lignes. La limite du dépôt est de **500 à 600 lignes
par fichier** : les consignes 4 et 5 sortent dans leurs propres fichiers plutôt
que de la faire déborder.

---

## 1 — Les règles de rythme

`MIN_SCENE_SECONDS = 1` et `MAX_SCENE_SECONDS = 30` dans `service.ts` sont des
garde-fous, pas un rythme : entre les deux, tout est permis, et toutes les
scènes finissent par durer pareil.

Ajoute à la fiche :

```ts
rythme: { min: number; max: number }   // en secondes de narration
```

Pour `explainer` : **3 à 9 secondes**. Sous trois secondes une phrase n'a pas
fini d'être comprise ; au-delà de neuf, l'image a fini de dire ce qu'elle avait
à dire.

Le modèle n'écrit **jamais** de durée — elle est mesurée après coup par Edge
TTS. Tu lui parles donc en caractères, au débit de **14 caractères par
seconde** (`docs/providers.md`) : 3 à 9 secondes valent 42 à 126 caractères.
Expose une fonction qui fait cette conversion, et fais-la citer par
`lignesDesRegistres()` dans le prompt.

**Attention au plancher fournisseur.** Une scène animée ne descend pas sous
5 secondes chez Wan, et le clip Hailuo dure 6 secondes. Si le registre autorise
3 secondes sur un plan animé, la fin du clip tombe dans le vide. Soit tu
relèves le plancher des scènes `video`, soit tu calcules le `playbackRate` —
voir la consigne 8 du brief moteur, qui n'est pas la tienne.

---

## 2 — La liste blanche de transitions

`TRANSITIONS` en compte trente-cinq. Le modèle ne choisit plus, mais rien
n'empêche une fiche d'en écrire une qui jure avec son registre.

Ajoute :

```ts
transitions: readonly Transition[]
```

Pour `explainer` : `['none', 'fade', 'black', 'push-left']` — exactement ce que
`habille()` produit aujourd'hui, ni plus ni moins.

Puis **un test qui vérifie que tout ce que `habille()` rend est dans la liste
de sa propre fiche**, pour chaque registre, chaque ton, chaque place. C'est ce
test qui donne sa valeur à la liste : sans lui, c'est de la documentation.

---

## 3 — Le préfixe visuel et les ancrages

`render/demo/pipeline.ts` porte une constante `STYLE` de deux lignes, recopiée
sur chaque prompt d'image. Elle appartient au registre, pas au script qui
l'appelle.

Ajoute :

```ts
prefixeVisuel: string          // recollé devant chaque prompt visuel
ancrages: readonly string[]    // ce qui ne change pas d'un plan à l'autre
```

Le cadreur (`lib/storyboard/cadrage.ts`) tient déjà le **casting** — ce qui est
à l'image. Les ancrages tiennent le reste : la lumière, la palette, le rendu.
Deux plans du même film ne peuvent pas être éclairés par deux personnes
différentes.

Pour `explainer`, quelque chose comme : photographie documentaire, lumière
naturelle, textures réelles, jamais d'illustration ni de 3D, palette sourde.

Expose une fonction qui rend la chaîne complète, et remplace la constante
`STYLE` par elle dans `render/demo/pipeline.ts`. `lib/storyboard/images.ts`
(`visualPrompt`) reçoit déjà le style du projet en argument : c'est là qu'il
faut le faire passer, pas ailleurs.

**Ne touche pas** au bloc de directions techniques que `visualPrompt()` ajoute
déjà (« no on-screen text, no distorted hands »…). Il reste, il est
indépendant du registre.

---

## 4 — Palette, typographie, échelle

Aujourd'hui : `SUBTITLE_HEIGHT_RATIO`, `WATERMARK_HEIGHT_RATIO`,
`STRUCTURED_HEIGHT_RATIO`, `WHEEL_HEIGHT_RATIO` sont des constantes de
`lib/render/composition.ts`, et les couleurs vivent dans
`render/gentube-v1/style.css`.

La cible : le registre porte une palette et une échelle, et la composition les
pose en **variables CSS** sur la racine du document. Aucune règle CSS n'est
réécrite — elles lisent des variables au lieu de valeurs.

Fais-le dans un fichier neuf, `lib/storyboard/apparence.ts`, pour ne pas
gonfler `registres.ts` ni `composition.ts` (490 lignes, la limite est proche).

**L'invariant qui compte** : `SUBTITLE_BOTTOM` vaut 18 % en 9:16 parce que
TikTok, Reels et Shorts posent leur interface sur le bas du cadre. Ce n'est pas
une valeur de style, c'est une contrainte de plateforme. Elle ne devient pas
réglable par registre.

---

## 5 — Les règles de qualité

Des contrôles, pas des réglages. Un registre déclare ce qu'il refuse ; le code
le vérifie et le dit avant le rendu, jamais après.

Trois qui valent le coup :

- contraste minimum de 4,5:1 entre un texte et son fond ;
- pas plus de trois couleurs à l'écran en même temps, fond exclu ;
- durée d'affichage minimale d'un plan — c'est la borne basse de la consigne 1.

Un fichier neuf, `lib/storyboard/controles.ts`. Chaque règle rend un verdict
nommé, jamais un booléen nu : un rendu refusé doit dire **laquelle** des trois
a sauté et sur quelle scène.

Le refus n'est pas une exception qui remonte. Le storyboard est déjà payé quand
on arrive là : la règle qui saute se journalise et laisse passer, comme le fait
déjà le contrat de rendu par plan.

---

## 6 — L'audio du registre

`musicVolume` et `sfxVolume` vivent sur la vidéo (`lib/storyboard/render.ts`),
choisis nulle part et jamais expliqués.

Le registre doit porter : l'humeur musicale qu'il demande, le volume de lit
sonore qui lui va, et le seuil de ducking — de combien la musique baisse quand
la voix parle.

`explainer` veut une musique qu'on n'entend pas : autour de 0,08, et un ducking
franc. Un registre plus rythmé monterait les deux.

Le catalogue de sons est dans `assets/sounds/` et ses fiches portent déjà les
secondes d'impact (`peaks`). L'humeur du registre sert à **filtrer ce
catalogue** avant de le donner au modèle, pas à générer quoi que ce soit.

---

## 7 — Le ton de la voix

`video.voice` porte un identifiant de voix, et `lib/voice/index.ts` choisit le
fournisseur selon le plan du client. Rien ne dit **comment** la phrase doit
être dite.

Le registre porte une intention de diction — posée, chaleureuse, nette — et
elle sert à deux endroits :

1. choisir la voix par défaut d'un projet dans ce registre ;
2. la donner aux fournisseurs qui savent la lire. Edge et Polly ne l'écoutent
   pas, ElevenLabs oui.

**La mesure ne change pas de main.** `MEASURING_PROVIDER` est Edge et le reste :
c'est lui qui donne la durée de chaque scène, et une durée mesurée par un autre
fournisseur ne serait plus la même. Le ton s'applique à la livraison, jamais à
la mesure.

---

## Ce que tu ne touches pas

- `habille()` et sa grammaire de mouvement — ouverture en `dolly`, fermeture au
  noir en `orbit`, `pan` sur les bascules, `static` ailleurs. Elle est réglée.
- `lib/storyboard/cadrage.ts` — le cadreur appartient à un autre chantier.
- `lib/render/animations.ts`, `contenus.ts`, `nappes.ts` — le rendu des effets.
- Le contrat de rendu (`sceneRenderSchema`) : tu lis ses bornes, tu n'en poses
  pas de nouvelles. Une valeur hors bornes fait rejeter le plan **entier**, en
  silence — c'est arrivé le 5 septembre 2026 avec un `beatAccent` à 0,35 quand
  le plafond est 0,06.

---

## Comment vérifier

```bash
docker compose up -d postgres   # la suite a besoin du Postgres local
npx tsc --noEmit
npx vitest run
```

594 tests passent aujourd'hui. Aucun ne doit tomber.

Le test qui compte pour toi est celui qui existe déjà dans
`registres.test.ts` : **tout ce que `habille()` rend doit passer
`sceneEffectsSchema.parse()`**, pour chaque registre, chaque ton, chaque place.
Ajoute le tien sur la liste blanche (consigne 2) au même endroit.

Pour voir un rendu réel sans repasser par la base :

```bash
npx tsx render/demo/pipeline.ts "ton thème"
npx tsx render/demo/render.ts render/demo/essai.mp4
```

Le storyboard, les images, les voix et les clips sont mis en cache sur disque.
Relancer ne repaie rien. **Supprime un fichier et tu le repaies** — un clip
Hailuo coûte 0,19 $.
