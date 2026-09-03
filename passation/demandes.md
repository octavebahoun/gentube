# Demandes au palier 3

Les paliers 1 et 2 ne touchent pas à `lib/storyboard/render.ts` ni à
`lib/storyboard/service.ts`. Ils écrivent ici, le palier 3 applique et raye.

Écris ta demande **quand tu commences l'entrée**, pas quand tu la finis :
l'autre agent a besoin de temps pour l'intégrer.

Le format, et rien d'autre :

```
## palier <1|2> · <date heure>
Fichier : le fichier visé
Champ   : le chemin exact dans le schéma
Forme   : la forme du champ, en TypeScript
Timeline: ce que buildTimeline doit calculer, s'il y a lieu
Balisage: l'élément attendu dans sceneMarkup, s'il y a lieu
Prompt  : la ligne à ajouter au prompt système, en anglais — ou « rien »
```

Une demande appliquée est préfixée de `[fait]` par le palier 3, jamais
supprimée : on garde la trace de ce qui a été demandé et quand.

---

## palier 1 · 2026-09-03 02:20
Fichier : lib/storyboard/render.ts
Enum    : subtitleStyle
Ajouter : 'glitch-rgb', 'editorial-emphasis', 'kinetic-slam', 'matrix-decode', 'parallax-layers', 'texture', 'weight-shift', 'camera-follow'
Prompt  : Add subtitle styles (glitch-rgb, editorial-emphasis, kinetic-slam, matrix-decode, parallax-layers, texture, weight-shift, camera-follow) to system prompt.

## palier 1 · 2026-09-03 02:25
Fichier : lib/storyboard/render.ts
Enum    : kineticTitle.variant
Ajouter : 'handwritten', 'marker', 'marquee', 'brand'
Prompt  : Add kineticTitle variants ('handwritten', 'marker', 'marquee', 'brand') to system prompt.

## palier 2 · 2026-09-03 01:19
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.lightSweep
Forme   : { startInSeconds?: number, durationInSeconds?: number, color?: string }
Timeline: dans buildTimeline, scene.lightSweep ? { at: onBeat(scene, beats, scene.startInSeconds + (startInSeconds ?? 0.6)), duration: durationInSeconds ?? 0.9, color: color ?? '#ffffff' } : null
Balisage: <div class="light-sweep" id="ls<index>" style="--sweep-color:<color>"> dans sceneMarkup, dans le div .scene apres flash. Aucune piste : div non minute, anime par la timeline comme flash, il meurt avec sa scene.
Prompt  : "- `lightSweep` is optional: a soft diagonal light band crosses the frame once. Use it when the line turns hopeful or premium. { color?, startInSeconds?, durationInSeconds? }. Snaps to the beat when `onBeat` is true."

## palier 2 · 2026-09-03 01:19
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.grain
Forme   : { startInSeconds?: number, durationInSeconds?: number, opacity?: number }
Timeline: dans buildTimeline, scene.grain ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0)), duration: min(durationInSeconds ?? (fin - at), fin - at), opacity: opacity ?? 0.22 } : null. Pas de onBeat : c est une ambiance, pas un ponctuel.
Balisage: <div class="grain" id="gr<index>"> dans sceneMarkup, dans le div .scene apres flash. Id gr et non g : g<index> est deja la pastille du compteur. Aucune piste, meme raison que lightSweep.
Prompt  : "- `grain` is optional: a subtle animated film-grain overlay for warmth and analog character. { opacity? (default 0.22), startInSeconds?, durationInSeconds? }. Covers the whole scene by default."

## palier 2 · 2026-09-03 01:19
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.beatAccent
Forme   : { startInSeconds?: number, durationInSeconds?: number, strength?: number }
Timeline: dans buildTimeline, scene.beatAccent ? { at: onBeat(scene, beats, scene.startInSeconds + (startInSeconds ?? 0)), duration: durationInSeconds ?? 0.35, strength: strength ?? 0.035 } : null. Toujours cale sur le pic le plus proche quand la musique est connue, avec ou sans onBeat.
Balisage: aucun. Le tween pulse #s<index> (et #m<index> en plus si scene.hoisted, car le clip est hors du div) : pulse sur la scene, jamais sur #m d une image, pour ne pas se battre avec l echelle du Ken Burns. Aucune piste.
Prompt  : "- `beatAccent` is optional: a single music-hit sting, the frame micro-pulses and decays immediately. Use it on a word that lands hard. { strength? (default 0.035), startInSeconds?, durationInSeconds? }."

