# Brief — agent palier 2

> **Lis `passation/README.md` en entier avant d'écrire une ligne.** Les
> invariants du moteur (§4) et la façon de vérifier (§5) y sont, ils ne sont
> pas répétés ici. Un geste qui les viole marche dans l'aperçu et casse au
> rendu.

---

## Ta mission

Transposer les entrées de **palier 2**. Palier 2 veut dire : **un champ de
plus au contrat de rendu**. L'effet est une intention de mise en scène — la
caméra bouge, une lumière passe, un élément se révèle — et le storyboard doit
pouvoir la demander.

Il reste **162 entrées**, listées dans
[`passation/reste-palier-2.md`](reste-palier-2.md). C'est le plus gros paquet
des trois,: personne n'attend les 162.

Les familles les plus denses :

| Famille | Combien | Ce que c'est |
|---|---|---|
| Primitives de mouvement | 55 | révélations, décalages, rebonds sur un élément |
| Incrustations `lt-*`, `lower-third-*` | 10 | les tiers inférieurs — **voir la mise en garde** |
| Caméra | 5 | dolly, orbite, panoramique, parallaxe |
| Effets et lumière | 10 | fuites de lumière, éclairs, grain, aberration |
| Accessoires (`prop`) | 8 | objets posés sur le plan |
| `html-in-canvas` | 11 | du HTML rendu dans un canvas — **coûteux, mesure avant** |

---

## Ce que tu possèdes, et rien d'autre

| Fichier | Ce que tu y fais |
|---|---|
| `lib/render/animations.ts` | ton tween, dans la boucle par scène |
| `render/gentube-v1/style.css` | tes règles, **à la fin, dans une section à toi** |
| `lib/render/composition.test.ts` | tes tests, dans un `describe` à toi |

`animations.ts` porte ce qui anime **la scène** — fondu, zoom, tremblement,
éclair, titre, sous-titres. Ce qui dessine ce que la scène **raconte** —
compteur, tiers inférieur, graphique — vit dans `lib/render/contenus.ts`, qui
appartient au palier 3. Si ton effet a besoin d'une donnée écrite par le
storyboard, il n'est pas de ton palier.

**Tu ne touches pas** à `lib/storyboard/render.ts`, `lib/storyboard/service.ts`,
`lib/render/markup.ts`, `lib/render/plan.ts` ni `lib/render/contenus.ts`. Ce sont les quatre fichiers du
palier 3, et un effet en a besoin des quatre — c'est pour ça que tu passes par
`passation/demandes.md`, au format donné au §3 du README.

Une demande d'effet complète ressemble à ça :

```
## palier 2 · 2026-09-03 09:40
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.lightLeak
Forme   : { startInSeconds?: number, durationInSeconds?: number, color?: string }
Timeline: dans buildTimeline, { at: ms(scene.start + (startInSeconds ?? 0)),
          duration: durationInSeconds ?? 0.5, color: color ?? '#ffd9a0' }
Balisage: <div class="light-leak" id="ll<index>"> dans sceneMarkup, après flash
Prompt  : "- `lightLeak` is optional: a warm streak crosses the frame once.
           Use it when the line turns nostalgic. { color?, startInSeconds? }."
```

Plus ta demande est précise, moins il y a d'aller-retour. Écris-la **avant**
d'écrire le tween, pas après.

---

## Le contrat que tu étends

`sceneEffectsSchema` porte aujourd'hui :

```ts
zoom          'in' | 'out' | 'none'
transition    l'un des 40 noms
shake         booléen
matchCut      booléen  — mort des deux côtés, ne t'appuie pas dessus
onBeat        booléen  — cale flash et shake sur un pic de la musique
cameraMotion  'orbit' | 'dolly' | 'pan' | 'static'  — directive de prompt,
              traduite pour le modèle d'animation dans lib/storyboard/clips.ts
flash         { startInSeconds?, durationInSeconds?, color? }
```

Deux choses à en retenir.

**`cameraMotion` ne bouge pas la caméra chez nous.** C'est une directive
envoyée au modèle qui génère le clip. Si tu transposes une entrée `camera`,
demande-toi laquelle des deux tu fais : un vrai mouvement dans la page, ou une
consigne au générateur. Ce ne sont pas les mêmes fichiers ni le même coût.

**`onBeat` existe et vaut cher.** Un éclair posé à 0,8 s de la scène tombe
n'importe où ; le même éclair calé sur le pic le plus proche fait entendre le
montage. Tout effet ponctuel que tu ajoutes devrait pouvoir se caler dessus —
regarde comment `flash` le fait dans `buildTimeline`, et demande la même chose
pour le tien.

---

## Les pièges de ta famille

**Un effet ponctuel vit dans la scène, jamais au-dessus.** L'éclair est un
`<div>` à l'intérieur du `<div class="scene">` pour disparaître avec elle. Un
effet posé au niveau du document survit au plan qu'il ponctue et se retrouve
sur le suivant.

**Un clip vidéo porte déjà son propre mouvement.** Lui ajouter un Ken Burns
superpose deux caméras et donne le mal de mer. Regarde `zoom: isVideoPath(…) ?
null : kenBurns(…)` dans `plan.ts` : ton effet de caméra doit se poser la même
question.

**Le clip vit hors du div de la scène.** Un plan animé porte son `<video>` sur
sa propre piste — imbriqué, le moteur le sortirait gelé. Conséquence : le
fondu de la scène ne l'emporte pas avec lui, et un effet qui vise `.scene` ne
touchera pas le clip. Vise `#m<index>` aussi.

**Les pistes.** Le moteur refuse deux éléments qui se chevauchent sur la même
piste. `trackPlan()` réserve une bande par famille. Si tu ajoutes un élément
minuté, demande sa piste dans `demandes.md` — ne réutilise pas celle d'un
autre.

**`html-in-canvas`.** Onze entrées qui rendent du HTML dans un canvas. Sur
Lambda, en rastérisation logicielle, mesure le coût par image avant de
t'engager. Demande avant de prendre la première.

---

## Ce qui est déjà fait, ne le refais pas

Le zoom (Ken Burns), le tremblement, l'éclair, le calage sur la musique, les
40 transitions, le ralenti d'un clip court. Un tiers inférieur existe déjà en
trois variantes — `bar`, `stack`, `boxed` — donc les dix `lt-*` restants ne
sont intéressants que **s'ils apportent une forme qu'on n'a pas** : un
cartouche à trois lignes, une pastille avec pointeur d'état, un bandeau à
double barre. Ne refais pas le nôtre en plus joli.

Le détail entrée par entrée, avec un filtre « Reste seulement » :
<https://claude.ai/code/artifact/7cfe7d76-6dc7-4497-879c-2708f4360c6a>

---

## Ce que tu rends

1. Le code, sur ta branche ou dans ton worktree, **non poussé**.
2. `pnpm test` et `pnpm typecheck` verts.
3. Pour chaque effet : une capture au **milieu** de son animation, et ton avis
   dessus par écrit.
4. Tes demandes dans `passation/demandes.md`, à jour et précises.
5. Une ligne par entrée transposée dans `docs/vocabulaire-de-rendu.md`.

**Prends le temps qu'il faut.** Trois effets vérifiés à l'image valent mieux
que dix déclarés. Le palier 2 est celui où il est le plus facile d'écrire un
tween qui ne rend rien : il est déclaré, le test passe, et personne ne
regarde.

Si quelque chose te bloque plus de vingt minutes, écris-le dans
`passation/demandes.md` et passe à l'entrée suivante. Ne devine pas.
