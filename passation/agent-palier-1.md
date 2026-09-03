# Brief — agent palier 1

> **Lis `passation/README.md` en entier avant d'écrire une ligne.** Les
> invariants du moteur (§4) et la façon de vérifier (§5) y sont, ils ne sont
> pas répétés ici. Un geste qui les viole marche dans l'aperçu et casse au
> rendu.

---

## Ta mission

Transposer les entrées de **palier 1** du registre HyperFrames dans le moteur
de montage GenTube. Palier 1 veut dire : **l'extrait entre dans une scène tel
quel**. Il ne demande rien que la composition n'ait déjà — un conteneur, GSAP,
un instant de départ. Ton travail est une classe CSS et un tween.

Il reste **57 entrées**, listées dans
[`passation/reste-palier-1.md`](reste-palier-1.md).

Elles se rangent en quatre familles :

| Famille | Combien | Où ça atterrit |
|---|---|---|
| Styles de sous-titres `caption-*` | 9 | `style.css`, classe `.captions-<nom>` |
| Typographie animée | 4 + primitives | `gestures.ts`, table `TITRES` |
| Primitives de transition | 12 | `gestures.ts`, table `MOVES` |
| Primitives de mouvement et vidéo | 23 | à trier : beaucoup sont des variantes de ce qui existe |
| Écriture manuscrite `hw-*` | 4 | voir la mise en garde plus bas |

**Ne prends pas les 57.** Prends celles qui rendent quelque chose qu'on ne
sait pas faire, dans cet ordre : les `caption-*` d'abord (le champ existe en
base et neuf valeurs manquent), la typographie ensuite, les primitives en
dernier. Une entrée bien transposée vaut mieux que quatre à moitié.

---

## Ce que tu possèdes, et rien d'autre

| Fichier | Ce que tu y fais |
|---|---|
| `render/gentube-v1/style.css` | tes règles, **à la fin de la section concernée** |
| `lib/render/gestures.ts` | les tables `TITRES` et `MOVES` |
| `lib/render/composition.test.ts` | tes tests, dans un `describe` à toi |
| `render/regression/run.ts` | seulement si tu ajoutes une passe visuelle |

**Tu ne touches pas** à `lib/storyboard/render.ts` ni à
`lib/storyboard/service.ts`. Quand tu as besoin d'un nom dans un enum ou d'une
ligne dans le prompt système, tu l'écris dans `passation/demandes.md` au
format donné au §3 du README, et le palier 3 l'applique. Écris ta demande
**dès que tu commences l'entrée**, pas à la fin : l'autre agent a besoin de
temps pour l'intégrer.

---

## Comment on transpose, concrètement

Prends `caption-glitch-rgb` comme exemple de la marche à suivre.

**1. Lis l'entrée du registre.** `npx hyperframes add caption-glitch-rgb` la
pose dans un dossier ; le HTML, le CSS et le tween sont dedans, autonomes.

**2. Sépare ce qui est apparence de ce qui est timeline.** L'apparence part
dans `style.css`. Le mouvement, s'il y en a un, part dans `gestures.ts`. Une
entrée du registre mélange souvent les deux dans un `<style>` local — chez
nous ils vivent séparément parce que la timeline est calculée hors de la page.

**3. Adapte au fait que la scène existe déjà.** L'extrait du registre est une
démonstration autonome : fond noir, texte centré, rien autour. Chez nous il
arrive sur une scène qui a déjà une image de fond, un voile, des sous-titres
mot à mot, un filigrane et parfois un bandeau. Vérifie que ton style reste
lisible sur une image claire **et** sur une image sombre.

**4. Respecte la structure du mot.** Chaque mot du sous-titre est un
`<span class="word">`, et les mots porteurs ont en plus la classe `fort`.
C'est le karaoké qui allume les mots un par un, pas ton CSS. Ton style décide
de quoi a l'air un mot allumé, jamais de quand il s'allume.

**5. Écris le test.** Un test par style, sur le HTML rendu. Regarde le
`describe('the three subtitle styles', …)` existant dans
`lib/render/composition.test.ts` : il vérifie que le bloc de légendes porte la
classe du style choisi. Le tien fait pareil.

**6. Rends l'image.** Ajoute ton style à l'enum (par `demandes.md`), puis :

```bash
npx tsx render/regression/run.ts --styles
```

Une référence manquante est écrite automatiquement. **Regarde-la avant de la
garder.** Si les neuf styles rendent la même image, ton style ne fait rien —
c'est exactement ce qui est arrivé aux vingt-sept variantes de titre, dont la
référence était prise après la fin de l'animation.

---

## Les pièges de ta famille

**Le bandeau derrière le mot.** Un `::before` en `z-index: -1` passe *derrière
l'image de la scène*, qui est opaque. Le bandeau de `highlight` existait et ne
se voyait jamais. Utilise le fond du mot, pas un pseudo-élément.

**GSAP n'anime pas tout.** Une variable CSS interpolée et un `background-size`
qui grandit ont échoué tous les deux avant que `background-position` marche.
Si ton tween ne fait rien, ce n'est pas forcément la timeline : c'est
peut-être la propriété.

**`background-clip: text` exige une couleur transparente.** Le contour des
autres styles ne s'applique donc plus, et il faut une ombre portée à la place.

**Les chiffres qui dansent.** Partout où des chiffres changent à l'image,
`font-variant-numeric: tabular-nums`, sinon le nombre bouge.

**Les `hw-*` (écriture manuscrite).** Quatre entrées, très belles, et très
chères : elles tracent des glyphes par centerline, avec une police Caveat et
un rendu qui « bout ». Regarde le coût par image avant de t'engager, et
demande avant de les prendre. Elles ne sont pas un palier 1 comme les autres.

**`caption-particle-burst` et `halftone-field`.** Des particules et un shader
plein cadre. Le rendu Lambda est logiciel — mesure avant, ou laisse.

---

## Ce qui est déjà fait, ne le refais pas

Neuf styles de sous-titres existent : `karaoke`, `fondant`, `cinematic`,
`highlight`, `pill`, `wipe`, `neon`, `gradient`, `blend`. Trente variantes de
titre cinétique existent. Vingt-trois gestes de transition existent.

Le détail entrée par entrée, avec un filtre « Reste seulement » :
<https://claude.ai/code/artifact/7cfe7d76-6dc7-4497-879c-2708f4360c6a>

---

## Ce que tu rends

1. Le code, sur ta branche ou dans ton worktree, **non poussé**.
2. `pnpm test` et `pnpm typecheck` verts.
3. Une planche contact de tes styles, et ton avis dessus par écrit : lequel ne
   te plaît pas, et pourquoi.
4. Tes demandes dans `passation/demandes.md`, à jour.
5. Une ligne par entrée transposée dans `docs/vocabulaire-de-rendu.md`.

**Prends le temps qu'il faut.** Si tu ne finis que quatre entrées et qu'elles
sont vérifiées à l'image, c'est un bon résultat. Douze entrées non regardées
n'en sont pas un.

Si quelque chose te bloque plus de vingt minutes, écris-le dans
`passation/demandes.md` et passe à l'entrée suivante. Ne devine pas.
