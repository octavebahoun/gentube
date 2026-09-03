# Passation — élargir le vocabulaire de rendu

Trois agents travaillent en parallèle sur le même dépôt, un par palier du
catalogue HyperFrames. Ce dossier existe pour qu'ils ne se marchent pas dessus
et qu'aucun ne réinvente ce que les deux autres ont déjà appris.

**Écrit le 3 septembre 2026.**

---

## 1. Ce qu'on est en train de faire

Le registre officiel [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)
expose **373 entrées** : 155 blocs et 218 composants. Chacune est un document
HTML autonome, animé par GSAP et minuté par `data-start` — exactement
l'architecture que `lib/render/composition.ts` génère. Il n'y a ni React ni
étape de compilation : le balisage, le CSS et le tween se transposent tels
quels.

GenTube est un éditeur vidéo complet : c'est le client qui décide du genre.
Donc **rien dans ce registre n'est hors sujet**. Le seul tri utile est ce que
chaque entrée coûte pour devenir disponible — et c'est ce qui donne les trois
paliers.

| Palier | Ce que ça coûte | Restant |
|---|---|---|
| 1 | Le champ existe déjà, ou l'extrait entre dans une scène tel quel | **57** |
| 2 | Un champ de plus dans `sceneEffectsSchema` | **162** |
| 3 | La scène doit porter du **contenu structuré**, pas un texte rédigé | **93** |

Au 3 septembre : **56 entrées rendues**, 5 reprises en partie, 312 restantes.

État à jour, entrée par entrée, avec un filtre « Reste seulement » :
<https://claude.ai/code/artifact/7cfe7d76-6dc7-4497-879c-2708f4360c6a>

---

## 2. Qui fait quoi

| Agent | Palier | Son brief |
|---|---|---|
| 1 | Styles de sous-titres, titres, primitives de transition | [`agent-palier-1.md`](agent-palier-1.md) |
| 2 | Effets, caméra, révélations, primitives de mouvement | [`agent-palier-2.md`](agent-palier-2.md) |
| 3 | Plans dont le contenu est une donnée | [`agent-palier-3.md`](agent-palier-3.md) |

---

## 3. La règle qui évite le carambolage

**Deux fichiers appartiennent au palier 3 et à lui seul :**

- `lib/storyboard/render.ts` — le contrat de rendu, les enums, les durées
- `lib/storyboard/service.ts` — le prompt système envoyé au modèle

Les paliers 1 et 2 **n'y touchent pas**. Quand ils ont besoin d'un nom dans un
enum ou d'une ligne dans le prompt, ils l'écrivent dans
`passation/demandes.md` sous cette forme :

```
## palier 1 · 2026-09-03 09:12
Fichier : lib/storyboard/render.ts
Enum    : sceneRenderSchema.kineticTitle.variant
Ajouter : 'wordmark', 'marquee'
Prompt  : rien à ajouter, la ligne existante liste déjà les variantes.
```

Le palier 3 relit ce fichier et applique. C'est plus lent qu'éditer soi-même,
et c'est le prix pour que trois agents finissent la même journée.

**Fichiers de chacun, sans recouvrement :**

| Fichier | À qui |
|---|---|
| `render/gentube-v1/style.css` | palier 1 |
| `lib/render/gestures.ts` | palier 1 |
| `lib/render/animations.ts` | palier 2 |
| `lib/render/contenus.ts` | palier 3 |
| `lib/render/markup.ts` | palier 3 |
| `lib/render/plan.ts` | palier 3 |
| `lib/storyboard/render.ts` | palier 3 |
| `lib/storyboard/service.ts` | palier 3 |
| `lib/render/composition.ts` | **personne sans le dire** |

`style.css` est gros et les trois familles y vivent côte à côte : ajoutez vos
règles **à la fin de votre section**, jamais au milieu de celle d'un autre.

Le plus sûr reste un **worktree git par agent**, fusionné à la fin.

---

## 4. Les invariants du moteur

Ce ne sont pas des préférences. Chacun a été payé par un rendu cassé.

### 4.1 Le moteur cherche chaque image, il ne joue pas la vidéo

C'est la règle qui gouverne tout le reste. Le rendu fait un `seek` sur chaque
image. **Toute animation doit être un `fromTo` posé à un instant absolu.**

- Jamais de `tl.to(...)` — il dépend de l'état laissé par le tween précédent,
  qui n'existe pas quand le moteur saute directement à la seconde 12.
- Jamais de temps accumulé dans la page. Les instants sont calculés dans
  `lib/render/plan.ts` et arrivent tout faits.
- Jamais de compteur incrémenté à chaque appel : on anime un objet nu et on
  écrit le texte dans `onUpdate`, sinon la vidéo est différente à chaque rendu.

Une animation qui viole ça **marche dans l'aperçu et casse au rendu**.

### 4.2 Aucun accent grave dans le HTML généré

`composition.ts` renvoie un littéral de gabarit qui court sur 300 lignes.
Un seul accent grave le referme — **commentaires compris** — et TypeScript
rapporte alors une erreur de syntaxe à une ligne qui n'a rien à voir. Même
règle dans les chaînes de `gestures.ts` et `animations.ts`. Trois fois le
même piège le 1er septembre, une quatrième le 3.

Écrivez `scaleX a zero`, pas `` `scaleX: 0` ``.

### 4.3 Aucun flou plein cadre

Le rendu Lambda est en rastérisation logicielle. Un `filter: blur()` ou un
`backdrop-filter` sur toute la trame coûte une passe par image et fait
exploser la facture. Le flou reste permis **sur un mot**, jamais sur un plan.

### 4.4 La scène entrante est toujours au-dessus dans le document

Un geste où seule la scène sortante bougerait ne se verrait pas : l'entrante
la couvre déjà. C'est pourquoi les volets découpent l'entrante au lieu
d'effacer la sortante, et pourquoi `iris-out` n'existe pas.

### 4.5 GSAP traite `scale` comme un raccourci

`scale` écrit scaleX **et** scaleY. Posé dans le même objet qu'un `scaleX`, il
l'écrase. Trois gestes rendaient une scène entière et immobile à cause de ça,
sous une suite de tests entièrement verte. Ne mélangez jamais les deux dans un
même `fromTo`.

### 4.6 Les shaders et les transformations cohabitent

Le compositeur de shaders et nos tweens écrivent sur les mêmes propriétés —
`visibility` et `opacity`. **Le dernier qui écrit gagne**, et rien d'autre ne
départage. La boucle des gestes est donc émise après `HyperShader.init(...)`.
Ne réordonnez pas.

### 4.7 Le drapeau de compositing

`window.__HF_PAGE_SIDE_COMPOSITING__ = true` est déclaré dans le `<head>`,
avant le bundle. Le rendu distribué câble ce drapeau à `false` en dur ; c'est
la page qui se déclare elle-même. Il coûte **+7 % sur Lambda**. Ne le retirez
pas, ne le dupliquez pas.

---

## 5. Comment on vérifie

### 5.1 Les tests

```bash
docker compose up -d      # Postgres local sur 54322, sinon rien ne tourne
pnpm test                 # 496 tests, 34 fichiers
pnpm typecheck
```

**`DATABASE_URL` vise Supabase distant.** Ne lancez aucune commande `db:*`.
Les tests, eux, fabriquent leur propre base locale.

Aucun test n'a le droit d'atteindre le réseau ni un fournisseur payant :
`lib/test/setup.ts` vide les clés et remplace `fetch` par un refus qui nomme
l'URL. Si votre test a besoin d'une réponse, posez-la avec
`vi.stubGlobal('fetch', …)`.

### 5.2 La garde visuelle

Les tests unitaires vérifient qu'un tween est **déclaré** au bon instant. Ils
ne voient pas qu'une règle CSS l'a rendu invisible. Toutes les vraies pannes du
1er au 3 septembre sont passées à travers une suite verte.

```bash
docker compose up -d
pnpm test:visual                                  # 14 instants de base
npx tsx render/regression/run.ts --styles         # un rendu par style de sous-titre
npx tsx render/regression/run.ts --titres         # un rendu par variante de titre
npx tsx render/regression/run.ts --transitions    # un rendu par transition
npx tsx render/regression/run.ts --tiers          # un rendu par tiers inférieur
```

**Trois règles, non négociables :**

1. **Ne lancez jamais `--update` sans avoir comparé d'abord.** `--update`
   accepte ce qui est là, il ne juge rien. Le 2 septembre, une erreur de
   syntaxe avait empêché toute la timeline de se charger ; les références ont
   été régénérées et la garde a annoncé « conformes » sur une composition
   morte.
2. **Regardez les images**, ne lisez pas seulement les scores. Une planche
   contact se fabrique en une ligne :
   ```bash
   cd render/regression/references
   montage titre-*.png -tile 7x4 -geometry 250x+3+3 -background '#111' /tmp/planche.png
   ```
3. **Capturez au milieu du geste, pas après.** Un instant pris quand
   l'animation est finie rend toutes les variantes identiques et ne surveille
   plus rien. `momentDuTitre()` et `momentDeLaCoupe()` dans
   `render/regression/fixtures.ts` calculent ça pour vous — servez-vous-en
   plutôt que d'écrire une seconde en dur.

Un filet en plus, quand une page semble figée sans raison :

```bash
npx hyperframes validate render/gentube-v1
```

Il lit les erreurs JavaScript de la page. Une timeline qui ne se charge pas y
apparaît en une ligne.

---

## 6. Comment on écrit

- **500 à 600 lignes par fichier.** La limite est au fichier, pas à la
  fonction. Extrayez des fonctions importables **au fur et à mesure**, pas
  après coup. `composition.ts` avait dérivé à 867 lignes ; il est à 442.
- Les commentaires disent **pourquoi**, jamais quoi. Le code dit le quoi.
- Le français dans les commentaires et les messages de commit, l'anglais dans
  le prompt système (les modèles d'image sont entraînés sur des légendes
  anglaises).
- Suivez le style du fichier où vous écrivez : densité de commentaires,
  nommage, tournures.
- Gardez les tests existants et les signatures publiques qui marchent.

### Les commits

- Un message qui explique la décision, pas la liste des fichiers touchés.
- **Aucune ligne `Co-Authored-By`.** Aucune mention d'une génération.
- Terminer par :
  ```
  Claude-Session: <lien de ta session>
  ```
- Ne poussez pas. La branche est `ai-video-saas`. C'est Octave qui décide.

---

## 7. Ce qu'il ne faut pas faire

- Ne pressez pas le travail. Une entrée transposée à moitié coûte plus cher
  qu'une entrée pas commencée : elle passe les tests, elle rend une image
  plausible, et personne ne la revoit.
- Ne touchez pas à ce qui n'est pas dans votre colonne du tableau du §3.
- Ne prenez pas une décision d'infrastructure — AWS, fournisseur payant,
  nouveau service — sans demander. Annoncez, attendez l'accord, agissez.
- N'inventez pas de champ dans la base. Le contrat de rendu vit en `jsonb`
  précisément pour qu'ajouter une variante soit un déploiement et non une
  migration.
- Ne recopiez pas une entrée du registre bêtement. Elle est écrite pour une
  démonstration autonome ; chez nous elle doit vivre dans une scène qui a déjà
  un fond, des sous-titres et une piste audio.

---

## 8. Où lire le reste

| Sujet | Fichier |
|---|---|
| Le projet entier, et pourquoi il est fait comme ça | `docs/passation.md` |
| Le catalogue et l'ordre des lots | `docs/vocabulaire-de-rendu.md` |
| La garde visuelle en détail | `render/regression/README.md` |
| Les contrats entre étapes du pipeline | `docs/contrats.md` |
| Ce que chaque fournisseur coûte | `docs/tarifs.md` |
