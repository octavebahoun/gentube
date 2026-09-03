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










