# Prince — surface produit et rendu visuel

Tu possèdes **à quoi la vidéo ressemble**, et **tout ce que l'utilisateur
voit**. C'est le couloir à plus forte valeur produit : l'éditeur de storyboard
*est* GenTube.

Stack : Next.js 15 (App Router), React 19, Tailwind, shadcn/ui, accent
`orange-500`. Server actions avec `validatedActionWithUser` + `useActionState`.

**Tu possèdes seul la coquille partagée** : `app/(dashboard)/dashboard/layout.tsx`,
`components/ui/`, la navigation. Personne d'autre n'y touche — ça supprime
la classe de conflits la plus pénible à quatre.

---

## La règle non négociable, avant tout le reste

Le rendu vidéo **cherche chaque image** (`seek`) dans un Chrome headless : il
saute à t=0,033 s, capture, saute à t=0,066 s, capture. Il ne *joue* jamais la
page.

Donc toute animation doit être pilotée par du **temps déclaré**, jamais par du
temps **accumulé**.

```js
// ❌ Se casse au rendu : rien ne s'accumule quand on saute d'image en image
let x = 0;
function loop() { x += 2; el.style.left = x + 'px'; requestAnimationFrame(loop); }

// ✅ Position dérivée du temps : identique quel que soit l'ordre des sauts
const t = hyperframes.time;      // seconde courante
el.style.left = (t * 60) + 'px';
```

Une animation parfaite dans l'aperçu qui se casse au rendu, c'est **le** piège
de cette approche. GSAP avec des timelines est sûr, `requestAnimationFrame`
à la main ne l'est pas.

`hyperframes snapshot` sert à détecter ces régressions — utilise-le.

---

## 1. Les templates vidéo

On a quitté Remotion (licence payante) pour **Hyperframes** de HeyGen : on
écrit du HTML/CSS/JS, il rend un MP4. Apache 2.0.

Le timeline se déclare en **attributs de données, en secondes** :

```html
<div id="stage" data-composition-id="v42" data-width="1920" data-height="1080">
  <img class="clip" data-start="0"   data-duration="5.28" data-track-index="0" src="…">
  <audio            data-start="0"   data-duration="5.28" data-track-index="2" src="narration.mp3">
  <audio            data-start="0"   data-duration="42"   data-track-index="3"
                    data-volume="0.09" src="music.mp3">
</div>
```

À faire :

- [ ] Décider : **un template unique** piloté par attributs, ou un template par
      pipeline (`image`, `video`, `mixed`). Je penche pour un seul — sinon
      trois choses à maintenir en parallèle.
- [ ] Les sous-titres **karaoké** : chaque plan porte déjà ses timings
      **mot à mot** (`shots.words`, mesurés sur l'audio réel, pas estimés).
      Trois styles à faire : `karaoke`, `fondant`, `cinematic`.
- [ ] Les transitions via **`@hyperframes/shader-transitions`** (WebGL).
      Notre enum actuel a 9 transitions dans `lib/storyboard/render.ts` — il
      faut l'**aligner sur leur vocabulaire maintenant**, tant que la colonne
      `render` (jsonb) est vide en base. Demain c'est une migration de données.
- [ ] Les effets déjà prévus au contrat : zoom, shake, matchCut, flash,
      mouvements de caméra, `overlayText`, `kineticTitle`, `card`.
- [ ] `@hyperframes/registry` fournit **50+ blocs prêts** (lower thirds,
      data-viz, cartes sociales). Regarde avant de coder à la main.

---

## 2. L'éditeur de storyboard

L'écran existe : `app/(dashboard)/dashboard/videos/[id]/storyboard.tsx`.
Il fait le minimum — deux zones de texte par scène, une pastille de durée,
un bouton.

**Comprends d'abord le modèle, il est contre-intuitif :**

1. Le LLM écrit la **narration** (le texte parlé) et le **prompt visuel**.
   Il n'écrit **jamais** de durée.
2. La durée est d'abord **estimée** depuis le texte (~14 caractères/seconde).
3. La voix off est générée, et la durée devient **mesurée** sur l'audio réel.
4. **On ne débite les crédits que quand tout est mesuré** — donc le prix
   affiché est le prix exact. `validateStoryboard()` refuse tant qu'une durée
   est estimée.

La durée est donc **en lecture seule** dans l'UI, avec une pastille
« estimée / mesurée ». L'utilisateur change la durée en changeant le texte,
jamais en tapant un nombre.

À faire :

- [ ] Réordonnancement des scènes (aujourd'hui : deux boutons haut/bas)
- [ ] Régénération d'une scène seule
- [ ] Intégrer **`<hyperframes-player>`** — un web component embarquable qui
      lit et permet de scruber la composition dans le navigateur, sans rendu.
      C'est l'aperçu, gratuit.
- [ ] Indiquer clairement le passage estimé → mesuré (c'est là que l'argent
      se décide)

---

## 3. UI de sound design — la plus grosse inconnue

Le modèle porte déjà les bruitages **par scène**, avec les **secondes exactes
où le son frappe** (`sound_assets.impacts`), pour caler un effet sur une coupe
au lieu de deviner. Un catalogue de 51 sons existe. **Rien ne l'expose.**

À concevoir : comment un utilisateur non technicien choisit une ambiance, pose
un bruitage sur une scène, et règle deux volumes (`musicVolume` à 0,09 par
défaut, `sfxVolume` à 1).

Note utile : Hyperframes fait du *voiceover carve* — il creuse le lit musical
seulement dans les bandes de fréquence de la voix. Donc pas besoin d'exposer
des réglages fins de volume, le mixage se débrouille.

Un prompt de wireframe existe pour cet écran en **§2.9 bis** de
`docs/produit-et-wireframes.md`.

---

## 4. Le reste des écrans

- [ ] Écran de production en direct — avancement des jobs, par étape
- [ ] **Réglages vidéo** : ratio (16:9 / 9:16), voix, style de sous-titres,
      musique. **Tout existe en base, aucune UI ne l'expose.**
- [ ] Bibliothèque de vidéos avec filtres
- [ ] UX d'erreur et de reprise quand un job échoue (ça arrivera souvent :
      les providers d'IA échouent)
- [ ] Onboarding / premier lancement
- [ ] Landing + page tarifs — **à confirmer** avant de commencer

---

## Contexte produit

Marché : Afrique de l'Ouest francophone. Prix en **FCFA**, paiement par
**mobile money**. Mobile d'abord, connexions lentes, écrans modestes.

Les utilisateurs ne sont pas développeurs. Ils écrivent une idée, ils
obtiennent une vidéo. Chaque écran qui demande un réglage technique est un
écran qui les perd.

---

## Fini quand

`pnpm test`, `pnpm typecheck` et `pnpm build` passent. Yannick te fournit un
**corpus de fixtures** (une vidéo entièrement voicée, durées mesurées, URLs
d'assets bidon) pour que tu ne dépendes pas du back.
