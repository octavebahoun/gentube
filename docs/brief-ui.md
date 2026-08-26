# Brief pour l'agent UI

Tu prends **toute la surface visuelle** de GenTube. Un autre agent travaille en
parallèle sur le moteur de rendu vidéo. Vous ne devez pas vous croiser.

---

## Avant d'écrire une ligne

Lis ces trois skills du dépôt, dans cet ordre. Elles ne sont pas
décoratives : elles portent les règles de design que ce projet suit.

1. **`.claude/skills/ui-ux-pro-max`** — l'intelligence UI/UX : palettes,
   appariements de polices, règles d'accessibilité, interactions, typographie,
   graphiques. Commence par elle.
2. **`.claude/skills/frontend-design`** — la direction visuelle : comment ne
   pas produire une interface qui ressemble à un gabarit par défaut.
3. **`.claude/skills/copywriting`** — pour tout texte visible : titres,
   libellés de boutons, états vides, messages d'erreur.

Puis lis **`docs/passation.md`** en entier. C'est le briefing du projet : ce
qu'il fait, pourquoi les choix sont ce qu'ils sont, et ce qui n'existe pas
encore.

---

## Ton périmètre, et ce qui n'est pas à toi

**À toi :**

- `components/` — tout
- `app/(dashboard)/` — tous les écrans
- `app/(login)/` — connexion, inscription
- `app/globals.css` — les tokens de couleur
- `package.json` — les dépendances UI uniquement

**Pas à toi, sous aucun prétexte :**

- `lib/` — toute la logique métier, le stockage, les crédits, le rendu
- `lib/db/schema.ts` et `lib/db/migrations/` — **surtout pas**. Le fichier
  `migrations/meta/_journal.json` est réécrit à chaque génération de
  migration : deux personnes qui en créent une le même jour produisent un
  conflit qui ne se résout pas tout seul.
- `app/api/`

Si un écran a besoin d'une donnée que le serveur ne rend pas encore, **ne
l'écris pas toi-même** : note-le dans une section « à brancher » à la fin de
ton travail, et affiche un état vide honnête en attendant.

---

## La palette — relevée sur la maquette, pas inventée

La maquette de référence est `docs/fr1.png`. **Rouge sur fond noir.** Pas
d'orange.

| Rôle | Hex | HSL |
|---|---|---|
| Rouge principal (boutons, CTA) | `#CE1F20` | `0 74% 47%` |
| Rouge accent (titres, sur-titres) | `#E52627` | `0 79% 52%` |
| Fond de page | `#111111` | `0 0% 7%` |
| Surface (cartes, panneaux) | `#1B1B1B` | `0 0% 11%` |

**Le thème est sombre par défaut.** La maquette n'a pas de variante claire ;
si tu en fais une, elle ne doit pas devenir le défaut.

### Deux choses à corriger, et c'est le premier travail

**1. Le code est en orange, la maquette est en rouge.** Il y a **31
occurrences** de `orange-*` en dur dans `app/` et `components/`
(`bg-orange-500`, `hover:bg-orange-600`…). Elles contredisent la maquette.

**2. La couleur d'accent n'est nulle part dans les tokens.** Elle est écrite
à la main dans chaque composant. Donc la changer demande 31 modifications au
lieu d'une.

Le bon ordre :

1. Poser le rouge dans `--primary` (et son `--primary-foreground`) dans
   `app/globals.css`.
2. Remplacer les 31 `orange-*` par `bg-primary`, `text-primary`, etc.
3. Vérifier qu'aucune couleur d'accent ne subsiste en dur.

Après ça, changer la teinte du produit est une ligne.

### Pendant que tu y es : `app/globals.css` est en désordre

Le fichier définit les mêmes tokens **deux fois**, dans deux blocs `:root`
séparés (lignes ~85 et ~170), plus deux blocs `.dark`. Deux définitions
concurrentes de la même variable, c'est une couleur qui change selon l'ordre
de cascade. À unifier en un seul jeu.

---

## La mine d'or : le projet `/home/precieux/my-app`

Un autre projet du même auteur, **même stack exacte** : Next 16.3.0, React
19.2.8, Tailwind 4, `lucide-react`, `class-variance-authority`. Il contient
**50 composants UI** là où GenTube en a 8, et des écrans qui se recouvrent
presque un pour un avec les nôtres.

### Le seul obstacle

**my-app utilise `@base-ui/react`, GenTube utilise `radix-ui`.** Même forme
shadcn, primitives différentes. Donc pas de copier-coller direct.

Vu les volumes — 50 contre 8 — le sens de la migration est évident :
**adopter `@base-ui/react` dans GenTube**, importer le jeu complet, puis
porter nos 8 composants existants.

Et il y a exactement l'outil pour ça : la skill
**`/home/precieux/my-app/.claude/skills/migrate-radix-to-base`**. Lis-la
avant de convertir quoi que ce soit à la main.

### Ce qu'il y a à prendre

**Composants** (`/home/precieux/my-app/components/ui/`) : alert, avatar,
badge, breadcrumb, card, carousel, chart, checkbox, collapsible, drawer,
dropdown-menu, empty, field, input, input-group, input-otp, item, kbd, label,
navigation-menu, pagination, popover, progress, radio-group, resizable,
scroll-area, select, separator, sheet, sidebar, skeleton, slider, spinner,
switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip…

### Combien d'écrans, exactement

my-app porte **32 pages, ~6 000 lignes**. GenTube en a 13. Tous ne servent
pas — voici le tri.

**10 écrans clients à reprendre** (`/home/precieux/my-app/app/dashboard/`) :

| Écran | Lignes | Équivalent GenTube |
|---|---|---|
| `creer` | 333 | création de vidéo — existe en version brute |
| `editeur` | 257 | éditeur de storyboard — **le plus important** |
| `series` | 242 | projets |
| `fabrication` | 202 | production en direct — **n'existe pas** |
| `videos/[slug]` | 201 | détail d'une vidéo |
| `marque` | 194 | style et voix du projet |
| `credits` | 191 | facturation |
| `videos` | — | bibliothèque |
| `modeles` | — | templates de montage |
| `page.tsx` | — | accueil du tableau de bord |

**4 écrans autour** : `(auth)/login`, `(auth)/signup`, `onboarding`, et
`tarifs` (page publique, 194 lignes).

**15 écrans d'administration en bonus** (`/home/precieux/my-app/app/admin/`) :
comptes, grand-livre, paiements, fabrication, santé, audit, événements,
qualité, modèles, tarifs, paramètres, clés-api. **GenTube n'a aucun
back-office aujourd'hui.** Ne les prends qu'une fois les écrans clients
posés.

**Deux à ignorer :** `developpeurs` (clés API — GenTube n'expose pas d'API
publique) et `qualite` si son contenu ne correspond à rien chez nous.

**Le vrai travail n'est pas la copie.** Ces écrans lisent Supabase ; GenTube
est sur Drizzle avec des server actions. Ce qui migre, c'est la couche
visuelle. Compte le débranchement des données comme la moitié du temps, pas
comme un détail.

**Chrome applicatif** (`/home/precieux/my-app/components/`) : `app-sidebar`,
`app-header`, `nav-main`, `nav-user`, `team-switcher`, `sidebar-credits`,
`login-form`, `signup-form`, `state-badge`, `logo`.

**Dépendances utiles à récupérer** : `@base-ui/react`, `@dnd-kit/*`,
`sonner`, `motion`, `recharts`, `@tanstack/react-table`, `next-themes`.

`@dnd-kit` mérite une mention : le réordonnancement des scènes du storyboard
se fait aujourd'hui avec **deux boutons haut/bas**.

### Attention en reprenant

my-app est branché sur **Supabase**. GenTube est sur **Drizzle + PostgreSQL**
avec des server actions. Ne reprends que la couche visuelle : dès qu'un
composant importe `@supabase/*`, coupe l'accès aux données et rebranche sur
l'action serveur correspondante de GenTube.

---

## Les écrans, par ordre de valeur

### 1. L'éditeur de storyboard

C'est le cœur du produit et l'écran où le client décide de payer.

- Liste des scènes, réordonnables **au glisser-déposer** (`@dnd-kit`).
- Par scène : la narration éditable, le prompt visuel, le type (image ou plan
  animé), la durée, l'image générée quand elle existe.
- **Le passage estimé → mesuré doit se voir.** C'est là que le prix devient
  exact : tant qu'une scène est estimée, le montant affiché est indicatif ;
  dès que la voix off est enregistrée, il est ferme. Un client qui ne voit pas
  cette bascule ne comprend pas pourquoi le prix a bougé.
- Le coût en crédits par scène, et le total, toujours visibles.

### 2. L'écran de production en direct

Une vidéo passe par 6 étapes : storyboard, voix off, images, plans animés,
montage, publication. **Trois seulement fonctionnent aujourd'hui.**

Montre l'avancement par étape, ce qui a échoué, et ce qu'on peut relancer.
Les fournisseurs échouent régulièrement : cet écran sera ouvert tous les
matins.

### 3. La création de vidéo

Titre, thème, résolution, pipeline, format. Existe déjà en version brute dans
`app/(dashboard)/dashboard/projects/[id]/videos/new/`.

Contrainte à respecter : **en essai gratuit, seul le 480p est proposé et un
filigrane est annoncé.** Le serveur le vérifie aussi — ne te contente pas de
masquer l'option, mais ne la montre pas non plus.

### 4. Les crédits et la facturation

Deux poches à distinguer visuellement : le **quota mensuel** qui expire en fin
de cycle, et les **crédits achetés** qui n'expirent jamais. Cette distinction
est une promesse commerciale, pas un détail d'affichage.

Prix en FCFA. Paiement par mobile money, sans carte bancaire.

### 5. La bibliothèque de vidéos

Liste avec filtres par état. Vignette, durée, coût, date, plateforme.

### 6. La landing publique

`docs/fr1.png` en est la maquette. Utilise la skill **copywriting** pour les
textes : l'accroche du produit est « on tape un sujet, on récupère une vidéo
prête à publier », et le différenciateur est **le montage** — les outils
concurrents livrent une image, une voix, un plan, et laissent l'utilisateur
assembler.

---

## Ce que l'interface ne doit jamais laisser croire

Trois règles du projet ont une conséquence visible. Les contredire à l'écran
crée une promesse que le serveur refusera.

1. **Une durée n'est jamais saisie à la main.** Il ne doit exister aucun champ
   de durée. Elle vient du texte tant qu'elle est estimée, de l'audio dès
   qu'il existe.
2. **On paie avant de générer.** Aucun bouton « générer les images » ne doit
   apparaître sur une vidéo en brouillon : le serveur la refuse.
3. **Le filigrane est décidé au moment du paiement.** Une vidéo payée en essai
   garde sa marque même si le client s'abonne le lendemain. L'interface ne
   doit pas laisser espérer l'inverse.

---

## Comment livrer

- Commits petits et fréquents, un sujet par commit.
- `pnpm typecheck` et `pnpm build` passent avant chaque commit.
- Les **298 tests existants** doivent rester verts : `pnpm test`. S'ils
  cassent, c'est que tu as touché à `lib/` — reviens en arrière.
- Termine par une liste « à brancher » : chaque endroit où l'écran attend une
  donnée que le serveur ne rend pas encore.

---

## Le premier commit

Ne commence pas par un écran. Commence par le socle, sinon tout est à
reprendre :

1. Installer `@base-ui/react` et les dépendances UI, **commiter tout de
   suite** — c'est le seul fichier que les deux agents peuvent se disputer.
2. Poser la palette rouge dans les tokens de `app/globals.css`, et unifier les
   blocs dupliqués.
3. Remplacer les 31 `orange-*`.
4. Importer les composants de my-app et porter les 8 existants.

Ensuite seulement, l'éditeur de storyboard.
