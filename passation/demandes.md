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

## [fait] palier 1 · 2026-09-03 02:40
Fichier : lib/storyboard/render.ts
Enum    : MOVE_TRANSITIONS
Ajouter : 'whip-pan-cut', 'cut-the-curve', 'grid-pixelate-wipe', 'rubber-band-bumper', 'chromatic-wipe', 'morph-swap', 'parallax-zoom', 'parallax-unzoom', 'page-slide', 'halftone-dissolve', 'type-match-cut', 'match-cut'
Prompt  : Add new transform transitions ('whip-pan-cut', 'cut-the-curve', 'grid-pixelate-wipe', 'rubber-band-bumper', 'chromatic-wipe', 'morph-swap', 'parallax-zoom', 'parallax-unzoom', 'page-slide', 'halftone-dissolve', 'type-match-cut', 'match-cut') to system prompt transition enum.

## [fait] palier 1 · 2026-09-03 02:42
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

## [fait] palier 2 · 2026-09-03 01:41
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vignette
Forme   : { strength?: number }
Timeline: rien. C est un etat, pas un geste : aucune donnee de temps a calculer.
Balisage: <div class="vignette" id="vg<index>" style="--vg-strength:<strength>"> dans sceneMarkup, dans le div .scene apres le grain. Aucune piste : div non minute, il vit et meurt avec sa scene.
Prompt  : "- `vignette` is optional: a soft radial darkening that pulls focus toward the center. { strength? (default 0.55) }."

## [fait] palier 2 · 2026-09-03 01:41
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.shockRing
Forme   : { startInSeconds?: number, durationInSeconds?: number, color?: string }
Timeline: dans buildTimeline, scene.shockRing ? { at: onBeat(scene, beats, scene.startInSeconds + (startInSeconds ?? 0.3)), duration: durationInSeconds ?? 0.6, color: color ?? '#ce1f20' } : null
Balisage: <div class="shock-ring" id="sr<index>" style="--ring-color:<color>"> dans sceneMarkup, dans le div .scene apres le grain. Aucune piste, meme raison que lightSweep.
Prompt  : "- `shockRing` is optional: one accent ring expands from the center and fades, like a logo sting. Use it when a name or number lands. { color? (default #ce1f20), startInSeconds?, durationInSeconds? }. Snaps to the beat when `onBeat` is true."

## [fait] palier 2 · 2026-09-03 01:41
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.featherSpot
Forme   : { startInSeconds?: number, durationInSeconds?: number, x?: number, y?: number, size?: number }
Timeline: dans buildTimeline, scene.featherSpot ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0)), duration: min(durationInSeconds ?? (fin - at), fin - at), x: x ?? 50, y: y ?? 42, size: size ?? 40 } : null. Pas de onBeat : c est un placement, pas une frappe. x, y, size en pourcents du cadre.
Balisage: <div class="feather-spot" id="fs<index>" style="--spot-x:<x>%;--spot-y:<y>%;--spot-size:<size>%"> dans sceneMarkup, dans le div .scene apres le grain. Aucune piste.
Prompt  : "- `featherSpot` is optional: the frame dims except a soft elliptical hole that spotlights one area. { x?, y?, size? (percents, default 50/42/40), startInSeconds?, durationInSeconds? }. Covers the whole scene by default."

## [fait] palier 2 · 2026-09-03 01:51
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.gridDrift
Forme   : { startInSeconds?: number, durationInSeconds?: number, opacity?: number }
Timeline: dans buildTimeline, scene.gridDrift ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0)), duration: min(durationInSeconds ?? (fin - at), fin - at), opacity: opacity ?? 0.5 } : null. Pas de onBeat : c est un fond, pas une frappe. Le mouvement est une boucle exacte (une tuile traverse en 6 s, repeat deterministe depuis at).
Balisage: <div class="grid-drift" id="gd<index>"> dans sceneMarkup, dans le div .scene en premier (sous le media : c est un fond, le media le recouvre quand il y en a un — sur un plan sans image il se voit). Aucune piste.
Prompt  : "- `gridDrift` is optional: a faint technical grid slowly drifts behind the scene, for SaaS/code/data lines. { opacity? (default 0.5), startInSeconds?, durationInSeconds? }. Best on imageless plans; an image covers it."

## [fait] palier 2 · 2026-09-03 01:51
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.cursorClick
Forme   : { startInSeconds?: number, durationInSeconds?: number, fromX?: number, fromY?: number, x?: number, y?: number }
Timeline: dans buildTimeline, scene.cursorClick ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0.5)), duration: durationInSeconds ?? 0.9, fromXpx: arrondi(fromX ?? 12, en px sur storyboard.width), fromYpx, xPx, yPx } : null. En PX, pas en % : la garde refuse les tweens left/top (arrondi au pixel sous le moteur) — le balisage pose left/top en %, le tween n anime que x/y. Coords d entree en pourcents du cadre converties au format exact. Pas de onBeat : c est un geste montre, pas une frappe.
Balisage: <div class="cursor-click" id="cc<index>" style="left:<fromX>%;top:<fromY>%"><div class="cursor-ring"></div></div> dans sceneMarkup, dans le div .scene apres le grain. Aucune piste.
Prompt  : "- `cursorClick` is optional: a cursor glides to a point and clicks, firing a small ring pulse. Use it when the line says tap, click or open. { x?, y? (target percents, default 62/55), fromX?, fromY? (default 12/12), startInSeconds?, durationInSeconds? }."

## [fait] palier 2 · 2026-09-03 01:51
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.scanGate
Forme   : { startInSeconds?: number, durationInSeconds?: number, color?: string }
Timeline: dans buildTimeline, scene.scanGate ? { at: onBeat(scene, beats, scene.startInSeconds + (startInSeconds ?? 0.4)), duration: durationInSeconds ?? 1.2, color: color ?? '#4ad9ff', yPx: course en px de la ligne = 0.84 * 0.64 * storyboard.height } : null. En px, pas en % : la garde refuse les tweens top (meme regle que le curseur). Le cadre fait inset 18% 12% et la ligne va de 8% a 92% de sa hauteur.
Balisage: <div class="scan-gate" id="sg<index>" style="--gate-color:<color>"><div class="scan-line"></div><i class="gate-corner tl"></i><i class="gate-corner tr"></i><i class="gate-corner bl"></i><i class="gate-corner br"></i></div> dans sceneMarkup, dans le div .scene apres le grain. Aucune piste.
Prompt  : "- `scanGate` is optional: a viewfinder moment — corner brackets, one sweep line, a lock pulse. Use it when the line verifies, scans or detects. { color? (default #4ad9ff), startInSeconds?, durationInSeconds? }. Snaps to the beat when `onBeat` is true."

## [fait] palier 2 · 2026-09-03 02:01
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.toggleFlip
Forme   : { startInSeconds?: number, durationInSeconds?: number, on?: boolean }
Timeline: dans buildTimeline, scene.toggleFlip ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0.5)), duration: durationInSeconds ?? 0.7, on: on ?? true } : null. Pas de onBeat : c est un geste montre. Le tween lit on pour le sens (finit ON ou OFF).
Balisage: <div class="toggle-flip" id="tf<index>"><div class="toggle-thumb"></div></div> dans sceneMarkup, dans le div .scene apres le grain. L etat visuel de depart suit on (classe on si on est vrai). Aucune piste.
Prompt  : "- `toggleFlip` is optional: an oversized UI toggle that flips with a physical overshoot. Use it when the line says enable, switch or turn on. { on? (default true), startInSeconds?, durationInSeconds? }."

## [fait] palier 2 · 2026-09-03 02:01
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.auroraDrift
Forme   : { startInSeconds?: number, durationInSeconds?: number, opacity?: number }
Timeline: dans buildTimeline, scene.auroraDrift ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0)), duration: min(durationInSeconds ?? (fin - at), fin - at), opacity: opacity ?? 0.8 } : null. Pas de onBeat : c est un fond. Les trois nappes derivent a 9/13/17 s en boucle exacte depuis at.
Balisage: <div class="aurora" id="au<index>"><div class="blob-a"></div><div class="blob-b"></div><div class="blob-c"></div></div> dans sceneMarkup, dans le div .scene en premier (fond, sous le media). Aucune piste.
Prompt  : "- `auroraDrift` is optional: three soft color fields slowly drift behind the scene, for calm premium lines. { opacity? (default 0.8), startInSeconds?, durationInSeconds? }. Best on imageless plans; an image covers it."

## [fait] palier 2 · 2026-09-03 02:01
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.outlineDraw
Forme   : { startInSeconds?: number, durationInSeconds?: number, color?: string }
Timeline: dans buildTimeline, scene.outlineDraw ? { at: onBeat(scene, beats, scene.startInSeconds + (startInSeconds ?? 0.4)), duration: durationInSeconds ?? 1.0, color: color ?? '#ffd9a0' } : null. Quatre bords en sequence (quart de duree chacun) : le tween divise, rien a precalculer.
Balisage: <div class="outline-draw" id="od<index>" style="--trace-color:<color>"><i class="od-t"></i><i class="od-r"></i><i class="od-b"></i><i class="od-l"></i></div> dans sceneMarkup, dans le div .scene apres le grain. Des divs, pas de SVG : pathLength est ignore sur les formes et le tiret tombait sur le vrai perimetre (verifie a l image). Aucune piste.
Prompt  : "- `outlineDraw` is optional: a rounded outline draws itself clockwise around the frame to prove a callout. { color? (default #ffd9a0), startInSeconds?, durationInSeconds? }. Snaps to the beat when `onBeat` is true."

## [fait] palier 2 · 2026-09-03 11:01
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.hwBoil
Forme   : { amount?: number, startInSeconds?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.hwBoil ? { amount: amount ?? 1, at: ms(scene.startInSeconds + (startInSeconds ?? 0)), duration: min(durationInSeconds ?? (fin - at), fin - at) } : null. 0 = fige, 1 = calme (+-1px), 2 = vif (+-2.2px). Pas de balisage : c est le bouton commun que chaque noeud hw lit (boil propre ?? hwBoil.amount ?? 1). Aucune piste.
Prompt  : "- `hwBoil` is optional: hand-drawn strokes re-pose with a lively jitter while on screen. { amount? (0 still, 1 calm, 2 lively, default 1) }. Applies to every handwritten overlay of the scene."

## [fait] palier 2 · 2026-09-03 11:01
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.hwBoxLabel
Forme   : { label?: string, startInSeconds?: number, durationInSeconds?: number, boil?: number, color?: string }
Timeline: dans buildTimeline, scene.hwBoxLabel ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0.4)), duration: durationInSeconds ?? 1.2, label: label ?? null, color: color ?? '#ffffff', boil: boil ?? scene.hwBoil?.amount ?? 1 } : null. Le tween dessine le trait sur la premiere moitie, fait claquer le label a mi-chemin, boue ensuite.
Balisage: <div class="hw-box" id="hb<index>" style="--hw-ink:<color>"><svg viewBox="0 0 100 62" preserveAspectRatio="none"><path id="hb<index>-0" d="<rectangle arrondi wobble>" pathLength="100" /></svg> + label ? <div class="hw-label" id="hb<index>-l">label</div> : ''. Un path, pas un rect : Chrome ignore pathLength sur les formes. Aucune piste.
Prompt  : "- `hwBoxLabel` is optional: a wobbled hand-drawn rounded box draws on with a handwritten label. { label?, startInSeconds?, durationInSeconds?, boil?, color? }."

## [fait] palier 2 · 2026-09-03 11:01
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.hwCalloutCircle
Forme   : { label?: string, x?: number, y?: number, size?: number, startInSeconds?: number, durationInSeconds?: number, boil?: number, color?: string }
Timeline: dans buildTimeline, scene.hwCalloutCircle ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0.4)), duration: durationInSeconds ?? 1.2, x: x ?? 50, y: y ?? 45, size: size ?? 30, label: label ?? null, color: color ?? '#ffffff', boil: boil ?? scene.hwBoil?.amount ?? 1 } : null. x, y, size en pourcents.
Balisage: <div class="hw-callout" id="hc<index>" style="--hw-ink:<color>;left:<x-size/2>%;top:<y-size/2>%;width:<size>%"><svg viewBox="0 0 100 100"><path id="hc<index>-0" d="<ellipse wobble>" pathLength="100" /></svg> + label ? <div class="hw-label" id="hc<index>-l">label</div> : ''. Aucune piste.
Prompt  : "- `hwCalloutCircle` is optional: a wobbled hand-drawn ellipse circles a target with a handwritten label. { label?, x?, y?, size? (percents, default 50/45/30), startInSeconds?, durationInSeconds?, boil?, color? }."

## [fait] palier 2 · 2026-09-03 11:01
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.hwFrame
Forme   : { caption?: string, startInSeconds?: number, durationInSeconds?: number, boil?: number, color?: string }
Timeline: dans buildTimeline, scene.hwFrame ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0.2)), duration: durationInSeconds ?? 1.4, caption: caption ?? null, color: color ?? '#ffffff', boil: boil ?? scene.hwBoil?.amount ?? 1 } : null. Bordure puis griffonnages en sequence sur duration.
Balisage: <div class="hw-frame" id="hf<index>" style="--hw-ink:<color>"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path id="hf<index>-0" d="<bordure>" pathLength="100" /><path id="hf<index>-1" d="<doodle1>" pathLength="100" /><path id="hf<index>-2" d="<doodle2>" pathLength="100" /></svg> + caption ? <div class="hw-caption" id="hf<index>-l">caption</div> : ''. Images dedans (le media reste), jamais de clip hisse : un plan anime garde son element video hors du div. Aucune piste.
Prompt  : "- `hwFrame` is optional: the still image sits in a hand-drawn border with corner doodles and a handwritten caption. { caption?, startInSeconds?, durationInSeconds?, boil?, color? }. Stills only, never a video clip."

## [fait] palier 2 · 2026-09-03 11:01
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.hwPipeline
Forme   : { nodes: string[], startInSeconds?: number, durationInSeconds?: number, boil?: number, color?: string }
Timeline: dans buildTimeline, scene.hwPipeline ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0.3)), duration: durationInSeconds ?? Math.min(2.4, 0.6 * nodes.length), color: color ?? '#ffffff', boil: boil ?? scene.hwBoil?.amount ?? 1, boxes: N instants (un par boite), traits: N-1 {at, duree} en sequence, labels: N instants colles aux boites } : null. La sequence tient dans duration, en boite-liaison-boite.
Balisage: <div class="hw-pipe" id="hp<index>" style="--hw-ink:<color>"> + par noeud <div class="hw-node" id="hp<index>-n<k>"><div class="hw-label" id="hp<index>-l<k>">noeud</div></div> + entre noeuds <svg><path id="hp<index>-c<k>" d="<liaison courbe wobble>" pathLength="100" /></svg>. Boites en flex, liaisons en absolu entre elles. Aucune piste.
Prompt  : "- `hwPipeline` is optional: wobbled boxes with handwritten labels join in sequence from a node list. { nodes: string[] (2 to 4), startInSeconds?, durationInSeconds?, boil?, color? }."

## [fait] palier 1 · 2026-09-03 02:45
Fichier : lib/storyboard/render.ts
Enum    : kineticTitle.variant
Ajouter : 'callout', 'morphtext'
Prompt  : Add kineticTitle variants ('callout', 'morphtext') to system prompt.

## [fait] palier 1 · 2026-09-03 02:46
Fichier : lib/storyboard/render.ts
Enum    : MOVE_TRANSITIONS
Ajouter : 'freeze-cut', 'editorial-flash-overlay', 'hw-scribble-transition', 'vfx-text-cursor', 'organic-light-leak-overlay', 'ordered-dither-pass', 'parallax-device-dive', 'halftone-field'
Prompt  : Add new transition and overlay primitives ('freeze-cut', 'editorial-flash-overlay', 'hw-scribble-transition', 'vfx-text-cursor', 'organic-light-leak-overlay', 'ordered-dither-pass', 'parallax-device-dive', 'halftone-field') to system prompt transition enum.

## [fait] palier 2 · 2026-09-03 02:57
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.mkBackground
Forme   : { startInSeconds?: number, frostedGlass?: boolean }
Timeline: dans buildTimeline, scene.mkBackground ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0)), frostedGlass: frostedGlass ?? true } : null
Balisage: <div class="mk-background" id="mkbg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `mkBackground` is optional: procedural soft-blob gradient backdrop. { frostedGlass?, startInSeconds? }"

## [fait] palier 2 · 2026-09-03 02:57
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ytLcdBackground
Forme   : { scanlines?: boolean, grain?: boolean }
Timeline: dans buildTimeline, scene.ytLcdBackground ? { scanlines: scanlines ?? true, grain: grain ?? true } : null
Balisage: <div class="yt-lcd-background" id="ytlcd<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ytLcdBackground` is optional: textured paper scanlines drift backdrop. { scanlines?, grain? }"

## [fait] palier 2 · 2026-09-03 02:57
Fichier : lib/storyboard/render.ts
Enum    : kineticTitle.variant
Ajouter : 'logo-outro'
Prompt  : Add kineticTitle variant 'logo-outro' to system prompt.

## [fait] palier 2 · 2026-09-03 02:57
Fichier : lib/storyboard/render.ts
Enum    : lowerThirdSchema.variant
Ajouter : 'bild'
Prompt  : Add lowerThird variant 'bild' (news-style tight fit red/white boxes) to system prompt.

## [fait] palier 2 · 2026-09-03 02:57
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.camcorderHud
Forme   : { showBattery?: boolean, showRec?: boolean, dateText?: string }
Timeline: dans buildTimeline, scene.camcorderHud ? { showBattery: showBattery ?? true, showRec: showRec ?? true, dateText: dateText ?? 'REC 00:00:00' } : null
Balisage: <div class="camcorder-hud" id="chud<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `camcorderHud` is optional: retro camcorder overlay with REC badge, battery, date/counter. { showBattery?, showRec?, dateText? }"

## [fait] palier 2 · 2026-09-03 02:57
Fichier : lib/storyboard/render.ts
Enum    : MOVE_TRANSITIONS & sceneEffectsSchema.cameraDollyZoom
Ajouter : 'camera-dolly-zoom'
Forme   : { direction?: 'in' | 'out', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.cameraDollyZoom ? { direction: direction ?? 'in', durationInSeconds: durationInSeconds ?? 0.75 } : null
Prompt  : Add transition 'camera-dolly-zoom' and effect `cameraDollyZoom` to system prompt.

## [fait] palier 2 · 2026-09-03 03:10
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.cameraShake
Forme   : { profile?: string, intensity?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.cameraShake ? { profile: profile ?? 'handheld', intensity: intensity ?? 0.5, durationInSeconds: durationInSeconds ?? 1.0 } : null
Balisage: appliqué via transform shake sur .scene
Prompt  : "- `cameraShake` is optional: procedural handheld/lens camera shake. { profile?, intensity?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 03:10
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.panStations
Forme   : { stops?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.panStations ? { stops: stops ?? 3, durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: appliqué via keyframed pan sur .scene
Prompt  : "- `panStations` is optional: lateral camera move across continuous station stops. { stops?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 03:10
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.scrollCameraStory
Forme   : { sections?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.scrollCameraStory ? { sections: sections ?? 3, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: appliqué via vertical parallax scroll sur .scene
Prompt  : "- `scrollCameraStory` is optional: vertical scroll camera pass with parallax layers. { sections?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 03:10
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ytCameraMove
Forme   : { mode?: 'zoom' | 'slide' | 'tilt', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ytCameraMove ? { mode: mode ?? 'zoom', durationInSeconds: durationInSeconds ?? 1.5 } : null
Prompt  : "- `ytCameraMove` is optional: dynamic camera zoom/slide/tilt helper with defocus pulse. { mode?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 03:10
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.terminalSimulator
Forme   : { command?: string, output?: string }
Timeline: dans buildTimeline, scene.terminalSimulator ? { command: command ?? '', output: output ?? '' } : null
Balisage: <div class="terminal-simulator" id="tsim<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `terminalSimulator` is optional: retro terminal window streaming typed commands & output. { command?, output? }"

## [fait] palier 2 · 2026-09-03 11:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.gradeSplitReveal
Forme   : { startInSeconds?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.gradeSplitReveal ? { at: ms(scene.startInSeconds + (startInSeconds ?? 0.5)), duration: durationInSeconds ?? 1.5 } : null
Balisage: <div class="grade-split-reveal" id="gsr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `gradeSplitReveal` is optional: split sweep comparison between raw media and color-graded media. { startInSeconds?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.multiplayerCursors
Forme   : { count?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.multiplayerCursors ? { count: count ?? 3, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="multiplayer-cursors" id="mpc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `multiplayerCursors` is optional: labeled collaborator cursors drifting into a shared center zone. { count?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.mkLineGraph
Forme   : { seriesCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.mkLineGraph ? { seriesCount: seriesCount ?? 2, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="mk-line-graph" id="mklg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `mkLineGraph` is optional: SVG line series graph draw-on with animated dot markers. { seriesCount?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.badgeMatrix
Forme   : { rows?: number, cols?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.badgeMatrix ? { rows: rows ?? 2, cols: cols ?? 3, durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="badge-matrix" id="bmx<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `badgeMatrix` is optional: grid matrix of status pills (success/warning/neutral). { rows?, cols?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.metricCalloutGrid
Forme   : { cards?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.metricCalloutGrid ? { cards: cards ?? 3, durationInSeconds: durationInSeconds ?? 1.8 } : null
Balisage: <div class="metric-callout-grid" id="mcg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `metricCalloutGrid` is optional: multi-card KPI display grid with stagger animation. { cards?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.mkProgressStat
Forme   : { value?: number, max?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.mkProgressStat ? { value: value ?? 85, max: max ?? 100, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="mk-progress-stat" id="mkps<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `mkProgressStat` is optional: big numeral count-up with progress bar filling to target. { value?, max?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.mkSpecsList
Forme   : { itemsCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.mkSpecsList ? { itemsCount: itemsCount ?? 4, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="mk-specs-list" id="mksl<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `mkSpecsList` is optional: left-aligned checklist with staggered row slide-ins. { itemsCount?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.mkUsageArc
Forme   : { percentage?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.mkUsageArc ? { percentage: percentage ?? 75, durationInSeconds: durationInSeconds ?? 1.8 } : null
Balisage: <div class="mk-usage-arc" id="mkua<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `mkUsageArc` is optional: circular gauge drawing on with count-up percentage. { percentage?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.flowchart
Forme   : { nodesCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.flowchart ? { nodesCount: nodesCount ?? 4, durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="flowchart" id="fc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `flowchart` is optional: horizontal animated decision tree with connected nodes. { nodesCount?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.flowchartVertical
Forme   : { nodesCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.flowchartVertical ? { nodesCount: nodesCount ?? 4, durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="flowchart-vertical" id="fcv<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `flowchartVertical` is optional: vertical portrait decision tree with connected nodes. { nodesCount?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.confetti
Forme   : { particleCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.confetti ? { particleCount: particleCount ?? 50, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="confetti" id="cnf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `confetti` is optional: deterministic particle burst celebration effect. { particleCount?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.focusSwap
Forme   : { targetCard?: 'left' | 'right', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.focusSwap ? { targetCard: targetCard ?? 'left', durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="focus-swap" id="fsw<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `focusSwap` is optional: card focus swap with blur and scale depth transitions. { targetCard?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.meshGradientBg
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.meshGradientBg ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="mesh-gradient-bg" id="mgb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `meshGradientBg` is optional: render-safe animated radial mesh gradient background. { durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.motionBlur
Forme   : { intensity?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.motionBlur ? { intensity: intensity ?? 3, durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="motion-blur" id="mb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `motionBlur` is optional: velocity-driven SVG directional motion blur trail. { intensity?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.spotlightCard
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.spotlightCard ? { durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="spotlight-card" id="sc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `spotlightCard` is optional: card container with scripted cursor spotlight and lit border. { durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.svgMaskReveal
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.svgMaskReveal ? { durationInSeconds: durationInSeconds ?? 1.8 } : null
Balisage: <div class="svg-mask-reveal" id="smr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `svgMaskReveal` is optional: soft token sweep revealing media through an SVG wordmark mask. { durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ytScreenWarp
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ytScreenWarp ? { durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="yt-screen-warp" id="ysw<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ytScreenWarp` is optional: CRT display grid, scanline, vignette, and 3D screen warp wrapper. { durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:57
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.avatarCloud
Forme   : { count?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.avatarCloud ? { count: count ?? 8, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="avatar-cloud" id="avc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `avatarCloud` is optional: lettermark avatars populating an elliptical cloud with fine SVG links. { count?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:57
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.overwhelmSurround
Forme   : { itemsCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.overwhelmSurround ? { itemsCount: itemsCount ?? 8, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="overwhelm-surround" id="ows<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `overwhelmSurround` is optional: task and ping bubbles accelerating inward around subject. { itemsCount?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:57
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.staggerCascade
Forme   : { columns?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.staggerCascade ? { columns: columns ?? 3, durationInSeconds: durationInSeconds ?? 1.8 } : null
Balisage: <div class="stagger-cascade" id="sgc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `staggerCascade` is optional: grid of tile cards fading and traveling into place with stagger. { columns?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:57
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.freezeFrameDressing
Forme   : { paperTexture?: boolean, tapeStickers?: boolean, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.freezeFrameDressing ? { paperTexture: paperTexture ?? true, tapeStickers: tapeStickers ?? true, durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="freeze-frame-dressing" id="ffd<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `freezeFrameDressing` is optional: paper, tape, and flash dressing for freeze-frame subject. { paperTexture?, tapeStickers?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:57
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.hwArrow
Forme   : { curve?: 'straight' | 'gentle' | 'swoop', strokeStyle?: 'plain' | 'soft' | 'sharp' | 'spray', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.hwArrow ? { curve: curve ?? 'gentle', strokeStyle: strokeStyle ?? 'plain', durationInSeconds: durationInSeconds ?? 1.2 } : null
Balisage: <div class="hw-arrow" id="hwa<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `hwArrow` is optional: wobbled draw-on annotation arrow with travel-aligned head arrival stretch. { curve?, strokeStyle?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:59
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.hwTextCloud
Forme   : { text?: string, tailPosition?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.hwTextCloud ? { text: text ?? '', tailPosition: tailPosition ?? 'bottom-left', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="hw-text-cloud" id="hwtc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `hwTextCloud` is optional: hand-drawn speech bubble with positionable tail and typewriter text. { text?, tailPosition?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:59
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.hwUnderline
Forme   : { style?: 'squiggle' | 'strikethrough' | 'bracket', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.hwUnderline ? { style: style ?? 'squiggle', durationInSeconds: durationInSeconds ?? 1.2 } : null
Balisage: <div class="hw-underline" id="hwul<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `hwUnderline` is optional: hand-drawn squiggle underline, strikethrough or bracket mark draw-on. { style?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:59
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.spiralGalaxy
Forme   : { starCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.spiralGalaxy ? { starCount: starCount ?? 20000, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="spiral-galaxy" id="spg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `spiralGalaxy` is optional: GPU-accelerated turning spiral galaxy with differential rotation. { starCount?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:59
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ytFeatherHighlight
Forme   : { x?: number, y?: number, size?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ytFeatherHighlight ? { x: x ?? 50, y: y ?? 42, size: size ?? 40, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="yt-feather-highlight" id="yfh<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ytFeatherHighlight` is optional: spotlight hole glides across frame with dimmed surrounding backdrop. { x?, y?, size?, durationInSeconds? }"

## [fait] palier 2 · 2026-09-03 11:59
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.liquidGlassContextMenu
Forme   : { itemsCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.liquidGlassContextMenu ? { itemsCount: itemsCount ?? 4, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="liquid-glass-context-menu" id="lgcm<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `liquidGlassContextMenu` is optional: frosted glass context menu drifting over aurora background. { itemsCount?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:06
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.liquidGlassMediaControls
Forme   : { variant?: 'compact' | 'full', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.liquidGlassMediaControls ? { variant: variant ?? 'full', durationInSeconds: durationInSeconds ?? 2.2 } : null
Balisage: <div class="liquid-glass-media-controls" id="lgmc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `liquidGlassMediaControls` is optional: frosted glass media control panels spreading over aurora shader. { variant?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:06
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.liquidGlassNotification
Forme   : { count?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.liquidGlassNotification ? { count: count ?? 3, durationInSeconds: durationInSeconds ?? 1.8 } : null
Balisage: <div class="liquid-glass-notification" id="lgn<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `liquidGlassNotification` is optional: frosted glass notification cards floating over aurora shader. { count?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:06
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.liquidGlassWidgets
Forme   : { columns?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.liquidGlassWidgets ? { columns: columns ?? 2, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="liquid-glass-widgets" id="lgw<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `liquidGlassWidgets` is optional: frosted glass stat cards and showcase panel over aurora shader. { columns?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:06
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.macosTahoeLiquidGlass
Forme   : { theme?: 'dark' | 'light', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.macosTahoeLiquidGlass ? { theme: theme ?? 'dark', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="macos-tahoe-liquid-glass" id="mtlg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `macosTahoeLiquidGlass` is optional: 3D MacBook with macOS Tahoe glass UI and cinematic device camera move. { theme?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:06
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vfxIphoneDevice
Forme   : { model?: 'iphone15' | 'macbook', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.vfxIphoneDevice ? { model: model ?? 'iphone15', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="vfx-iphone-device" id="vid<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `vfxIphoneDevice` is optional: GLTF 3D device with live HTML content, morphing lens and turntable. { model?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vfxLiquidBackground
Forme   : { speed?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.vfxLiquidBackground ? { speed: speed ?? 1.0, durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="vfx-liquid-background" id="vlb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `vfxLiquidBackground` is optional: organic liquid simulation with vertex displacement plane. { speed?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vfxLiquidGlass
Forme   : { blur?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.vfxLiquidGlass ? { blur: blur ?? 10, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="vfx-liquid-glass" id="vlg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `vfxLiquidGlass` is optional: liquid glass VFX composition block. { blur?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vfxMagnetic
Forme   : { strength?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.vfxMagnetic ? { strength: strength ?? 1.0, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="vfx-magnetic" id="vmg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `vfxMagnetic` is optional: magnetic pull/repulsion WebGL effect composition block. { strength?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vfxPortal
Forme   : { scale?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.vfxPortal ? { scale: scale ?? 1.0, durationInSeconds: durationInSeconds ?? 2.2 } : null
Balisage: <div class="vfx-portal" id="vpt<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `vfxPortal` is optional: portal vortex WebGL effect composition block. { scale?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:13
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vfxShatter
Forme   : { piecesCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.vfxShatter ? { piecesCount: piecesCount ?? 20, durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="vfx-shatter" id="vst<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `vfxShatter` is optional: glass shatter fragment dispersal WebGL composition block. { piecesCount?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ios26LiquidGlass
Forme   : { wallpaper?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ios26LiquidGlass ? { wallpaper: wallpaper ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="ios26-liquid-glass" id="ilg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ios26LiquidGlass` is optional: 3D iPhone with liquid glass icons and notifications. { wallpaper?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ytLogoIntro
Forme   : { title: string, kicker?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ytLogoIntro ? { title, kicker: kicker ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="yt-logo-intro" id="yli<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ytLogoIntro` is optional: logo stamp with kicker line and accent arrow chip. { title, kicker?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ltAccentUnderline
Forme   : { name: string, role?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ltAccentUnderline ? { name, role: role ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="lt-accent-underline" id="lau<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ltAccentUnderline` is optional: cardless lower third with accent rule and rising name. { name, role?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ltBoldBlock
Forme   : { name: string, tag?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ltBoldBlock ? { name, tag: tag ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="lt-bold-block" id="lbb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ltBoldBlock` is optional: high-energy lower third with solid block wipe and uppercase name slam. { name, tag?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:14
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ltCleanBar
Forme   : { name: string, role?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ltCleanBar ? { name, role: role ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="lt-clean-bar" id="lcb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ltCleanBar` is optional: minimal white card lower third with clip wipe entrance. { name, role?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ltColorBlock
Forme   : { name: string, role?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ltColorBlock ? { name, role: role ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="lt-color-block" id="lcolb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ltColorBlock` is optional: high-energy lower third with accent color block slide. { name, role?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ltKickerName
Forme   : { name: string, kicker?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ltKickerName ? { name, kicker: kicker ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="lt-kicker-name" id="lkn<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ltKickerName` is optional: cardless lower third with accent kicker tag and heavy name. { name, kicker?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ltMaskReveal
Forme   : { name: string, role?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ltMaskReveal ? { name, role: role ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="lt-mask-reveal" id="lmr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ltMaskReveal` is optional: cardless lower third with accent clip-path reveal. { name, role?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ltNeonBorder
Forme   : { name: string, role?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ltNeonBorder ? { name, role: role ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="lt-neon-border" id="lnb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ltNeonBorder` is optional: lower third with light arcs and three-layer bloom. { name, role?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ltSoftPill
Forme   : { name: string, role?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ltSoftPill ? { name, role: role ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="lt-soft-pill" id="lsp<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ltSoftPill` is optional: rounded white pill lower third with scale-pop entrance. { name, role?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ltStackBars
Forme   : { name: string, role?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ltStackBars ? { name, role: role ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="lt-stack-bars" id="lsb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ltStackBars` is optional: two stacked bars lower third with dual wipe entrances. { name, role?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.newsTicker
Forme   : { headline: string, label?: string, items?: string[], durationInSeconds?: number }
Timeline: dans buildTimeline, scene.newsTicker ? { headline, label: label ?? 'LIVE', items: items ?? [], durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="news-ticker" id="ntk<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `newsTicker` is optional: broadcast lower-third ticker with headline ribbon and crawl. { headline, label?, items?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.asciiRenderPass
Forme   : { charset?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.asciiRenderPass ? { charset: charset ?? 'Standard', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="ascii-render-pass" id="arp<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `asciiRenderPass` is optional: live ASCII canvas luminance sampling. { charset?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.asciiTrailReveal
Forme   : { label?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.asciiTrailReveal ? { label: label ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="ascii-trail-reveal" id="atr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `asciiTrailReveal` is optional: S-curve sweep revealing panel through ASCII grid. { label?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:15
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.auroraDrift
Forme   : { intensity?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.auroraDrift ? { intensity: intensity ?? 1.0, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="aurora-drift" id="ard<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `auroraDrift` is optional: soft ambient aurora fields drifting loop over deep base. { intensity?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.beatAccent
Forme   : { intensity?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.beatAccent ? { intensity: intensity ?? 1.0, durationInSeconds: durationInSeconds ?? 0.5 } : null
Balisage: <div class="beat-accent" id="ba<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `beatAccent` is optional: single music-hit sting with impact flash and micro scale pulse. { intensity?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.beatPulseBackground
Forme   : { frequency?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.beatPulseBackground ? { frequency: frequency ?? 1.0, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="beat-pulse-background" id="bpb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `beatPulseBackground` is optional: accent backdrop pulsing glow and saturation on beat grid. { frequency?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.bottomUpLetters
Forme   : { text: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.bottomUpLetters ? { text, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="bottom-up-letters" id="bul<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `bottomUpLetters` is optional: splits text into letters and reveals each glyph from below. { text, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.chartStory
Forme   : { title?: string, kind?: 'bar' | 'line' | 'donut', durationInSeconds?: number }
Timeline: dans buildTimeline, scene.chartStory ? { title: title ?? '', kind: kind ?? 'bar', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="chart-story" id="chs<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `chartStory` is optional: statistical chart animated in reading order with value callout. { title?, kind?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.constellationHub
Forme   : { title?: string, nodes?: string[], durationInSeconds?: number }
Timeline: dans buildTimeline, scene.constellationHub ? { title: title ?? '', nodes: nodes ?? [], durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="constellation-hub" id="cnh<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `constellationHub` is optional: feature nodes SVG connectors drawing outward from hub. { title?, nodes?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ctaClose
Forme   : { headline: string, buttonText?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ctaClose ? { headline, buttonText: buttonText ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="cta-close" id="ctac<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ctaClose` is optional: action line landing per word with CTA capsule pop. { headline, buttonText?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ctaLockup
Forme   : { headline: string, buttonText?: string, subtext?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ctaLockup ? { headline, buttonText: buttonText ?? '', subtext: subtext ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="cta-lockup" id="ctal<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ctaLockup` is optional: canonical closing lockup with CTA capsule and subtext. { headline, buttonText?, subtext?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.cursorGlyphTrail
Forme   : { speed?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.cursorGlyphTrail ? { speed: speed ?? 1.0, durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="cursor-glyph-trail" id="cgt<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `cursorGlyphTrail` is optional: moving actor depositing dithered glyphs along trail. { speed?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.driftHold
Forme   : { speed?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.driftHold ? { speed: speed ?? 1.0, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="drift-hold" id="dfh<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `driftHold` is optional: card holding subtle loop rotation, scale breathing, and light sweep. { speed?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:16
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.echoTrail
Forme   : { count?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.echoTrail ? { count: count ?? 3, durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="echo-trail" id="ect<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `echoTrail` is optional: moving element with ghosted trail copies collapsing into rest. { count?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.facetMorph
Forme   : { silhouettes?: string[], durationInSeconds?: number }
Timeline: dans buildTimeline, scene.facetMorph ? { silhouettes: silhouettes ?? [], durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="facet-morph" id="fm<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `facetMorph` is optional: low-poly triangle mass morphing continuously between silhouettes. { silhouettes?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.focusRack
Forme   : { blurAmount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.focusRack ? { blurAmount: blurAmount ?? 10, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="focus-rack" id="fcr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `focusRack` is optional: focus shift between two depth cards through synchronized blur/scale. { blurAmount?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.gestureTap
Forme   : { label?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.gestureTap ? { label: label ?? '', durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="gesture-tap" id="gtp<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `gestureTap` is optional: contact circle tapping mobile button into new state. { label?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.glossSweep
Forme   : { angle?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.glossSweep ? { angle: angle ?? 45, durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="gloss-sweep" id="gsw<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `glossSweep` is optional: card landing with slam and catching specular gloss pass. { angle?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.grainField
Forme   : { density?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.grainField ? { density: density ?? 1.0, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="grain-field" id="grf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `grainField` is optional: dot field drifting over subtle luminance gradient loop. { density?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.gridCardAssemble
Forme   : { count?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.gridCardAssemble ? { count: count ?? 4, durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="grid-card-assemble" id="gca<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `gridCardAssemble` is optional: capability cards stagger-assembling into grid. { count?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.inkBleedReveal
Forme   : { label?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.inkBleedReveal ? { label: label ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="ink-bleed-reveal" id="ibr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `inkBleedReveal` is optional: liquid ink blooming through paper revealing slotted mark. { label?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.inlineHighlight
Forme   : { color?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.inlineHighlight ? { color: color ?? '#ffea00', durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="inline-highlight" id="ilh<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `inlineHighlight` is optional: marker-style inline highlight animating behind text. { color?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.kineticTypeSwap
Forme   : { sentence?: string, options?: string[], durationInSeconds?: number }
Timeline: dans buildTimeline, scene.kineticTypeSwap ? { sentence: sentence ?? '', options: options ?? [], durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="kinetic-type-swap" id="kts<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `kineticTypeSwap` is optional: held sentence with masked word slot rolling through options. { sentence?, options?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:17
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.lightSweepPass
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.lightSweepPass ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="light-sweep-pass" id="lsp<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `lightSweepPass` is optional: traveling key light reshading slotted scene. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:18
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.lineSwap
Forme   : { lineA?: string, lineB?: string, accentWord?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.lineSwap ? { lineA: lineA ?? '', lineB: lineB ?? '', accentWord: accentWord ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="line-swap" id="lsw<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `lineSwap` is optional: masked full-line beat replacement with optional accent underline. { lineA?, lineB?, accentWord?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:18
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.lockedNucleusOrbit
Forme   : { satellites?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.lockedNucleusOrbit ? { satellites: satellites ?? 3, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="locked-nucleus-orbit" id="lno<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `lockedNucleusOrbit` is optional: fixed center nucleus with deterministic satellite orbits settling into lockup. { satellites?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:18
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.logoSting
Forme   : { label?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.logoSting ? { label: label ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="logo-sting" id="lst<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `logoSting` is optional: wordmark slam with accent ring and impact frame. { label?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:18
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.markerChecklistCard
Forme   : { headline?: string, items?: string[], durationInSeconds?: number }
Timeline: dans buildTimeline, scene.markerChecklistCard ? { headline: headline ?? '', items: items ?? [], durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="marker-checklist-card" id="mcc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `markerChecklistCard` is optional: hand-lettered paper card with marker headline and checklist rows. { headline?, items?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:18
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.modalMorph
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.modalMorph ? { durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="modal-morph" id="mmr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `modalMorph` is optional: small card expanding into full panel with shared-element morph. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:20
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.multiDeviceSplay
Forme   : { devices?: string[], durationInSeconds?: number }
Timeline: dans buildTimeline, scene.multiDeviceSplay ? { devices: devices ?? [], durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="multi-device-splay" id="mds<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `multiDeviceSplay` is optional: phone/tablet/desktop mockups fanning from stack into splay. { devices?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:20
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.outlineDraw
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.outlineDraw ? { durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="outline-draw" id="old<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `outlineDraw` is optional: rounded outline drawing clockwise as conic-gradient border. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:20
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.oversizedCursor
Forme   : { targetId?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.oversizedCursor ? { targetId: targetId ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="oversized-cursor" id="osc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `oversizedCursor` is optional: oversized pointer traveling to target, clicking, then exiting. { targetId?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:20
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.particleImageReveal
Forme   : { particleCount?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.particleImageReveal ? { particleCount: particleCount ?? 200, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="particle-image-reveal" id="pir<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `particleImageReveal` is optional: particle field converging while image reveals beneath. { particleCount?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:20
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.particleTextDissolve
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.particleTextDissolve ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="particle-text-dissolve" id="ptd<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `particleTextDissolve` is optional: text assembling from or dissolving into particle cloud. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:24
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.physicalExit
Forme   : { mode?: "toss" | "drop" | "slide", durationInSeconds?: number }
Timeline: dans buildTimeline, scene.physicalExit ? { mode: mode ?? 'toss', durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="physical-exit" id="pex<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `physicalExit` is optional: card exiting with physical momentum without fading. { mode?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:24
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.pullBackReveal
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.pullBackReveal ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="pull-back-reveal" id="pbr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `pullBackReveal` is optional: tight stat detail expanding to reveal context cards. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:24
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.pushIn
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.pushIn ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="push-in" id="pin<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `pushIn` is optional: centered headline focus with continuous camera push. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:24
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.radialSurround
Forme   : { chips?: string[], durationInSeconds?: number }
Timeline: dans buildTimeline, scene.radialSurround ? { chips: chips ?? [], durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="radial-surround" id="rsr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `radialSurround` is optional: labeled hairline chips assembling around centered subject on elliptical ring. { chips?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:24
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.scrambleReveal
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.scrambleReveal ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="scramble-reveal" id="scr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `scrambleReveal` is optional: hacker-style text reveal locking string left to right. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.scrollFeed
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.scrollFeed ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="scroll-feed" id="sfd<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `scrollFeed` is optional: column of skeleton post cards scrolling upward. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.slitScanReveal
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.slitScanReveal ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="slit-scan-reveal" id="ssr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `slitScanReveal` is optional: frame rows sampling subject at offset times. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.socialProofCard
Forme   : { headline?: string, rating?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.socialProofCard ? { headline: headline ?? '', rating: rating ?? 5, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="social-proof-card" id="spc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `socialProofCard` is optional: app-store close card with stars, proof line, and CTA. { headline?, rating?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.softBlurIn
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.softBlurIn ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="soft-blur-in" id="sbi<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `softBlurIn` is optional: soft opacity, blur, and lift reveal for headline. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.splitTiltCards
Forme   : { cardA?: string, cardB?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.splitTiltCards ? { cardA: cardA ?? '', cardB: cardB ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="split-tilt-cards" id="stc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `splitTiltCards` is optional: two equal-weight cards arriving with book-open tilts. { cardA?, cardB?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.springPop
Forme   : { label?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.springPop ? { label: label ?? '', durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="spring-pop" id="spp<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `springPop` is optional: badge popping in with single overshoot. { label?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.stitchedTextDraw
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.stitchedTextDraw ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="stitched-text-draw" id="std<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `stitchedTextDraw` is optional: text drawn as thread stitches with needle hole dots. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.stopMotionCadence
Forme   : { fps?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.stopMotionCadence ? { fps: fps ?? 12, durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="stop-motion-cadence" id="smc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `stopMotionCadence` is optional: stepped-time motion driver with quantized frame rate. { fps?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.svgStrokeTrace
Forme   : { pathData?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.svgStrokeTrace ? { pathData: pathData ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="svg-stroke-trace" id="sst<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `svgStrokeTrace` is optional: authored SVG path drawing from its measured length. { pathData?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.swipeRail
Forme   : { cards?: string[], durationInSeconds?: number }
Timeline: dans buildTimeline, scene.swipeRail ? { cards: cards ?? [], durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="swipe-rail" id="srl<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `swipeRail` is optional: gesture leading horizontal card rail through drag and snap. { cards?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.testimonialProofCard
Forme   : { quote?: string, author?: string, role?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.testimonialProofCard ? { quote: quote ?? '', author: author ?? '', role: role ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="testimonial-proof-card" id="tpc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `testimonialProofCard` is optional: quote card with soft mask line reveal and author info. { quote?, author?, role?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.textShimmer
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.textShimmer ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="text-shimmer" id="tsh<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `textShimmer` is optional: specular gradient sweep through glyphs. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.touchIndicator
Forme   : { mode?: "tap" | "swipe", durationInSeconds?: number }
Timeline: dans buildTimeline, scene.touchIndicator ? { mode: mode ?? 'tap', durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="touch-indicator" id="tin<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `touchIndicator` is optional: contact-circle gesture actor touching glass and lifting. { mode?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.trustStrip
Forme   : { logos?: string[], durationInSeconds?: number }
Timeline: dans buildTimeline, scene.trustStrip ? { logos: logos ?? [], durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="trust-strip" id="tst<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `trustStrip` is optional: monochrome trust row with left-to-right opacity stagger. { logos?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:28
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.variableFontFlex
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.variableFontFlex ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="variable-font-flex" id="vff<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `variableFontFlex` is optional: variable-font weight and width flex on text arrival. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.velocityThrowSnap
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.velocityThrowSnap ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="velocity-throw-snap" id="vts<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `velocityThrowSnap` is optional: multi-shot rail whipping past and snapping hero shot to center. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.whiteboardInk
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.whiteboardInk ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="whiteboard-ink" id="wbk<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `whiteboardInk` is optional: whiteboard sketch drawing measured stroke at a time with pen nib. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.notificationPileup
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.notificationPileup ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="notification-pileup" id="npl<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `notificationPileup` is optional: mobile notifications pushing existing stack downward. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.beatTimeline
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.beatTimeline ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="beat-timeline" id="btm<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `beatTimeline` is optional: orchestration spine pinning titled beat rows to labels. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.mkPlaceholderGrid
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.mkPlaceholderGrid ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="mk-placeholder-grid" id="mpg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `mkPlaceholderGrid` is optional: N-up rounded-corner media grid. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ytVerticalFill
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ytVerticalFill ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="yt-vertical-fill" id="yvf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ytVerticalFill` is optional: portrait media filling widescreen frame via side fills. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.pullToRefresh
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.pullToRefresh ? { durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="pull-to-refresh" id="ptr<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `pullToRefresh` is optional: mobile list pull rubber-band animation. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.beforeAfterWipe
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.beforeAfterWipe ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="before-after-wipe" id="baw<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `beforeAfterWipe` is optional: comparison divider wiping after layer over before layer. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.cameraScanGate
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.cameraScanGate ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="camera-scan-gate" id="csg<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `cameraScanGate` is optional: camera viewfinder sweep with QR lock. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.comparisonSplit
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.comparisonSplit ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="comparison-split" id="cps<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `comparisonSplit` is optional: full-bleed panels comparing before and after states. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.deviceFrameStage
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.deviceFrameStage ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="device-frame-stage" id="dfs<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `deviceFrameStage` is optional: phone/tablet mockup staged with screen slot. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.storeBadgeLockup
Forme   : { headline?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.storeBadgeLockup ? { headline: headline ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="store-badge-lockup" id="sbl<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `storeBadgeLockup` is optional: headline above App Store and Play Store badges. { headline?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.testimonialCard
Forme   : { quote?: string, author?: string, handle?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.testimonialCard ? { quote: quote ?? '', author: author ?? '', handle: handle ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="testimonial-card" id="tcd<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `testimonialCard` is optional: customer quote with avatar, author, and handle. { quote?, author?, handle?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.toggleFlip
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.toggleFlip ? { durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="toggle-flip" id="tgf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `toggleFlip` is optional: oversized UI toggle switch flipping with momentum. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vectorEditorRig
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.vectorEditorRig ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="vector-editor-rig" id="ver<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `vectorEditorRig` is optional: design-tool chrome with vector pen path. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.instagramFollow
Forme   : { username?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.instagramFollow ? { username: username ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="instagram-follow" id="igf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `instagramFollow` is optional: Instagram follow overlay card. { username?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.macosNotification
Forme   : { title?: string, message?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.macosNotification ? { title: title ?? '', message: message ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="macos-notification" id="mcn<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `macosNotification` is optional: macOS notification banner. { title?, message?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.redditPost
Forme   : { title?: string, author?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.redditPost ? { title: title ?? '', author: author ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="reddit-post" id="rdp<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `redditPost` is optional: Reddit post card with upvotes. { title?, author?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.spotifyCard
Forme   : { track?: string, artist?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.spotifyCard ? { track: track ?? '', artist: artist ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="spotify-card" id="spf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `spotifyCard` is optional: Spotify now playing card. { track?, artist?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.threadMessageStack
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.threadMessageStack ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="thread-message-stack" id="tms<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `threadMessageStack` is optional: editable conversation stack. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.tiktokFollow
Forme   : { username?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.tiktokFollow ? { username: username ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="tiktok-follow" id="ttf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `tiktokFollow` is optional: TikTok follow overlay card. { username?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.xPost
Forme   : { text?: string, handle?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.xPost ? { text: text ?? '', handle: handle ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="x-post" id="xpt<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `xPost` is optional: X/Twitter post card overlay. { text?, handle?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ytCommentCard
Forme   : { text?: string, author?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ytCommentCard ? { text: text ?? '', author: author ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="yt-comment-card" id="ycc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ytCommentCard` is optional: YouTube comment card with typewriter effect. { text?, author?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ytLowerThird
Forme   : { channelName?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ytLowerThird ? { channelName: channelName ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="yt-lower-third" id="ylt<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ytLowerThird` is optional: YouTube subscribe lower third. { channelName?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.xFollowCard
Forme   : { handle?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.xFollowCard ? { handle: handle ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="x-follow-card" id="xfc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `xFollowCard` is optional: X social follow card. { handle?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.captionBlendDifference
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.captionBlendDifference ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="caption-blend-difference" id="cbd<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `captionBlendDifference` is optional: text with difference blend mode. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.shimmerSweep
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.shimmerSweep ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="shimmer-sweep" id="ssw<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `shimmerSweep` is optional: gradient mask sweep across text. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.splitFlapBoard
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.splitFlapBoard ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="split-flap-board" id="sfb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `splitFlapBoard` is optional: Solari departure board split-flap cascade. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.textureMaskText
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.textureMaskText ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="texture-mask-text" id="tmt<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `textureMaskText` is optional: PBR texture mask cut through glyphs. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.grainOverlay
Forme   : { intensity?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.grainOverlay ? { intensity: intensity ?? 1, durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="grain-overlay" id="gro<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `grainOverlay` is optional: film grain CSS texture overlay. { intensity?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.onboardingStepperFlow
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.onboardingStepperFlow ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="onboarding-stepper-flow" id="osf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `onboardingStepperFlow` is optional: onboarding flow milestone rail. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.settingsToggleFlow
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.settingsToggleFlow ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="settings-toggle-flow" id="stf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `settingsToggleFlow` is optional: settings flow with toggle switches. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.signupFlow
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.signupFlow ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="signup-flow" id="suf<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `signupFlow` is optional: signup flow form. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.arcMotionPath
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.arcMotionPath ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="arc-motion-path" id="amp<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `arcMotionPath` is optional: callout along curved arc. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.blurIn
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.blurIn ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="blur-in" id="bli<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `blurIn` is optional: word-level text blur reveal. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.dynamicGrid
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.dynamicGrid ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="dynamic-grid" id="dgd<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `dynamicGrid` is optional: animated grid background. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.separator
Forme   : { orientation?: "horizontal" | "vertical", durationInSeconds?: number }
Timeline: dans buildTimeline, scene.separator ? { orientation: orientation ?? 'horizontal', durationInSeconds: durationInSeconds ?? 1.5 } : null
Balisage: <div class="separator" id="sep<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `separator` is optional: one-pixel structural separator. { orientation?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.simulatedCursor
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.simulatedCursor ? { durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="simulated-cursor" id="smc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `simulatedCursor` is optional: cursor pointer and click pulse. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.streamingText
Forme   : { text?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.streamingText ? { text: text ?? '', durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="streaming-text" id="smt<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `streamingText` is optional: AI answer token rhythm text stream. { text?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.svgLineDrawLoader
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.svgLineDrawLoader ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="svg-line-draw-loader" id="sld<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `svgLineDrawLoader` is optional: stroke timeline path loader. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.threeOrbitingCards
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.threeOrbitingCards ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="three-orbiting-cards" id="toc<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `threeOrbitingCards` is optional: Three.js-powered orbit scene. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:35
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.vignette
Forme   : { intensity?: number, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.vignette ? { intensity: intensity ?? 1, durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="vignette" id="vgn<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `vignette` is optional: cinematic radial vignette overlay. { intensity?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:36
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.cameraRigDepthStack
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.cameraRigDepthStack ? { durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="camera-rig-depth-stack" id="crd<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `cameraRigDepthStack` is optional: 3D camera-rig card stack with depth and parallax. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:36
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.keyframeScrubStack
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.keyframeScrubStack ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="keyframe-scrub-stack" id="kss<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `keyframeScrubStack` is optional: keyframe-sequenced stack of cards. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:36
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.staggerLattice
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.staggerLattice ? { durationInSeconds: durationInSeconds ?? 2.5 } : null
Balisage: <div class="stagger-lattice" id="stl<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `staggerLattice` is optional: staggered grid reveal. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:36
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.ytCirclePointer
Forme   : { durationInSeconds?: number }
Timeline: dans buildTimeline, scene.ytCirclePointer ? { durationInSeconds: durationInSeconds ?? 2.0 } : null
Balisage: <div class="yt-circle-pointer" id="ycp<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `ytCirclePointer` is optional: draw-on annotation ellipse with countdown chip. { durationInSeconds? }"

## palier 2 · 2026-09-03 12:36
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.logoOutro
Forme   : { logoUrl?: string, tagline?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.logoOutro ? { logoUrl: logoUrl ?? '', tagline: tagline ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="logo-outro" id="lgo<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `logoOutro` is optional: cinematic logo reveal with tagline. { logoUrl?, tagline?, durationInSeconds? }"

## palier 2 · 2026-09-03 12:36
Fichier : lib/storyboard/render.ts
Champ   : sceneEffectsSchema.lowerThirdBild
Forme   : { headline?: string, subline?: string, durationInSeconds?: number }
Timeline: dans buildTimeline, scene.lowerThirdBild ? { headline: headline ?? '', subline: subline ?? '', durationInSeconds: durationInSeconds ?? 3.0 } : null
Balisage: <div class="lower-third-bild" id="ltb<index>"></div> dans sceneMarkup, dans .scene
Prompt  : "- `lowerThirdBild` is optional: news-style lower third with tight text boxes. { headline?, subline?, durationInSeconds? }"


















