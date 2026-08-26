# gentube-v1 — la composition

Ce dossier est un **projet HyperFrames**. Il ne contient pas d'`index.html`
versionné, et c'est voulu.

L'`index.html` est **généré à chaque rendu** par
`lib/render/composition.ts`, à partir du storyboard de la vidéo. Une
composition GenTube n'a pas un nombre de scènes fixe : elle en a autant que le
storyboard, chacune avec sa durée mesurée, son image, sa piste audio et ses
timings mot à mot. Un fichier statique ne peut pas décrire ça.

Ce qui vit ici :

- `hyperframes.json` — la configuration du projet
- `vendor/gsap.min.js` — GSAP figé sur place. Pas de CDN : le rendu tourne
  dans un Chrome sans réseau garanti, et sur Lambda il n'en aura pas du tout.
- `style.css` — l'apparence, éditable sans toucher au TypeScript

Pour voir à quoi ressemble une composition générée :

```bash
npx tsx lib/render/preview.ts   # écrit un index.html d'exemple ici
npx hyperframes check render/gentube-v1
```
