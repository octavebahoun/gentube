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
supprimée : on garde la trace de ce qui a été demandé et quand. Une demande
qu'il ne peut pas appliquer est préfixée de `[bloqué]`.

**Les réponses, elles, sont dans [`reponses.md`](reponses.md)** — ce qui a été
posé, ce qui a été changé au passage, et ce qu'il vous reste à faire.

---

## [bloqué] palier 1 · 2026-09-03 02:20
Fichier : lib/storyboard/render.ts
Enum    : subtitleStyle
Ajouter : 'glitch-rgb', 'editorial-emphasis', 'kinetic-slam', 'matrix-decode', 'parallax-layers', 'texture', 'weight-shift', 'camera-follow'
Prompt  : Add subtitle styles (glitch-rgb, editorial-emphasis, kinetic-slam, matrix-decode, parallax-layers, texture, weight-shift, camera-follow) to system prompt.

## [fait] palier 1 · 2026-09-03 02:25
Fichier : lib/storyboard/render.ts
Enum    : kineticTitle.variant
Ajouter : 'handwritten', 'marker', 'marquee', 'brand'
Prompt  : Add kineticTitle variants ('handwritten', 'marker', 'marquee', 'brand') to system prompt.

## palier 1 · 2026-09-03 02:40
Fichier : lib/storyboard/render.ts
Enum    : MOVE_TRANSITIONS
Ajouter : 'whip-pan-cut', 'cut-the-curve', 'grid-pixelate-wipe', 'rubber-band-bumper', 'chromatic-wipe', 'morph-swap', 'parallax-zoom', 'parallax-unzoom', 'page-slide', 'halftone-dissolve', 'type-match-cut', 'match-cut'
Prompt  : Add new transform transitions ('whip-pan-cut', 'cut-the-curve', 'grid-pixelate-wipe', 'rubber-band-bumper', 'chromatic-wipe', 'morph-swap', 'parallax-zoom', 'parallax-unzoom', 'page-slide', 'halftone-dissolve', 'type-match-cut', 'match-cut') to system prompt transition enum.

## palier 1 · 2026-09-03 02:42
Fichier : lib/storyboard/render.ts
Enum    : kineticTitle.variant
Ajouter : 'stagger', 'stateswap', 'prism', 'tiles', 'emphasis', 'popin', 'badge-pop', 'card-resize', 'icon-swap', 'menu-morph', 'skeleton-reveal', 'success-check', 'tilt-card', 'input-feedback', 'micro-transitions', 'panel-reveal', 'tabs-slide-indicator', 'avatar-group-hover'
Prompt  : Add motion primitive kineticTitle variants ('stagger', 'stateswap', 'prism', 'tiles', 'emphasis', 'popin', 'badge-pop', 'card-resize', 'icon-swap', 'menu-morph', 'skeleton-reveal', 'success-check', 'tilt-card', 'input-feedback', 'micro-transitions', 'panel-reveal', 'tabs-slide-indicator', 'avatar-group-hover') to system prompt.

## [fait] palier 2 · 2026-09-03 01:19
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.lightSweep
Forme   : { startInSeconds?: number, durationInSeconds?: number, color?: string }
Timeline: dans buildTimeline, scene.lightSweep ? { at: onBeat(scene, beats, scene.startInSeconds + (startInSeconds ?? 0.6)), duration: durationInSeconds ?? 0.9, color: color ?? '#ffffff' } : null
Balisage: <div class="light-sweep" id="ls<index>" style="--sweep-color:<color>"> dans sceneMarkup, dans le div .scene apres flash. Aucune piste : div non minute, anime par la timeline comme flash, il meurt avec sa scene.
Prompt  : "- `lightSweep` is optional: a soft diagonal light band crosses the frame once. Use it when the line turns hopeful or premium. { color?, startInSeconds?, durationInSeconds? }. Snaps to the beat when `onBeat` is true."

## [fait] palier 2 · 2026-09-03 01:19
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.grain
Forme   : { startInSeconds?: number, durationInSeconds?: number, opacity?: number }
Timeline: dans buildTimeline, scene.grain ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0)), duration: min(durationInSeconds ?? (fin - at), fin - at), opacity: opacity ?? 0.22 } : null. Pas de onBeat : c est une ambiance, pas un ponctuel.
Balisage: <div class="grain" id="gr<index>"> dans sceneMarkup, dans le div .scene apres flash. Id gr et non g : g<index> est deja la pastille du compteur. Aucune piste, meme raison que lightSweep.
Prompt  : "- `grain` is optional: a subtle animated film-grain overlay for warmth and analog character. { opacity? (default 0.22), startInSeconds?, durationInSeconds? }. Covers the whole scene by default."

## [fait] palier 2 · 2026-09-03 01:19
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.beatAccent
Forme   : { startInSeconds?: number, durationInSeconds?: number, strength?: number }
Timeline: dans buildTimeline, scene.beatAccent ? { at: onBeat(scene, beats, scene.startInSeconds + (startInSeconds ?? 0)), duration: durationInSeconds ?? 0.35, strength: strength ?? 0.035 } : null. Toujours cale sur le pic le plus proche quand la musique est connue, avec ou sans onBeat.
Balisage: aucun. Le tween pulse #s<index> (et #m<index> en plus si scene.hoisted, car le clip est hors du div) : pulse sur la scene, jamais sur #m d une image, pour ne pas se battre avec l echelle du Ken Burns. Aucune piste.
Prompt  : "- `beatAccent` is optional: a single music-hit sting, the frame micro-pulses and decays immediately. Use it on a word that lands hard. { strength? (default 0.035), startInSeconds?, durationInSeconds? }."

## palier 2 · 2026-09-03 01:41
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vignette
Forme   : { strength?: number }
Timeline: rien. C est un etat, pas un geste : aucune donnee de temps a calculer.
Balisage: <div class="vignette" id="vg<index>" style="--vg-strength:<strength>"> dans sceneMarkup, dans le div .scene apres le grain. Aucune piste : div non minute, il vit et meurt avec sa scene.
Prompt  : "- `vignette` is optional: a soft radial darkening that pulls focus toward the center. { strength? (default 0.55) }."

## palier 2 · 2026-09-03 01:41
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.shockRing
Forme   : { startInSeconds?: number, durationInSeconds?: number, color?: string }
Timeline: dans buildTimeline, scene.shockRing ? { at: onBeat(scene, beats, scene.startInSeconds + (startInSeconds ?? 0.3)), duration: durationInSeconds ?? 0.6, color: color ?? '#ce1f20' } : null
Balisage: <div class="shock-ring" id="sr<index>" style="--ring-color:<color>"> dans sceneMarkup, dans le div .scene apres le grain. Aucune piste, meme raison que lightSweep.
Prompt  : "- `shockRing` is optional: one accent ring expands from the center and fades, like a logo sting. Use it when a name or number lands. { color? (default #ce1f20), startInSeconds?, durationInSeconds? }. Snaps to the beat when `onBeat` is true."

## palier 2 · 2026-09-03 01:41
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.featherSpot
Forme   : { startInSeconds?: number, durationInSeconds?: number, x?: number, y?: number, size?: number }
Timeline: dans buildTimeline, scene.featherSpot ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0)), duration: min(durationInSeconds ?? (fin - at), fin - at), x: x ?? 50, y: y ?? 42, size: size ?? 40 } : null. Pas de onBeat : c est un placement, pas une frappe. x, y, size en pourcents du cadre.
Balisage: <div class="feather-spot" id="fs<index>" style="--spot-x:<x>%;--spot-y:<y>%;--spot-size:<size>%"> dans sceneMarkup, dans le div .scene apres le grain. Aucune piste.
Prompt  : "- `featherSpot` is optional: the frame dims except a soft elliptical hole that spotlights one area. { x?, y?, size? (percents, default 50/42/40), startInSeconds?, durationInSeconds? }. Covers the whole scene by default."

## palier 1 · 2026-09-03 02:45
Fichier : lib/storyboard/render.ts
Enum    : kineticTitle.variant
Ajouter : 'callout', 'morphtext'
Prompt  : Add kineticTitle variants ('callout', 'morphtext') to system prompt.

## palier 1 · 2026-09-03 02:46
Fichier : lib/storyboard/render.ts
Enum    : MOVE_TRANSITIONS
Ajouter : 'freeze-cut', 'editorial-flash-overlay', 'hw-scribble-transition', 'vfx-text-cursor', 'organic-light-leak-overlay', 'ordered-dither-pass', 'parallax-device-dive', 'halftone-field'
Prompt  : Add new transition and overlay primitives ('freeze-cut', 'editorial-flash-overlay', 'hw-scribble-transition', 'vfx-text-cursor', 'organic-light-leak-overlay', 'ordered-dither-pass', 'parallax-device-dive', 'halftone-field') to system prompt transition enum.


