# Plan de refonte frontend — consigne pour l'agent suivant

> L'agent précédent s'arrête ici, sur demande explicite du proprio.
> Ce fichier est la SEULE source à suivre. Ne pas improviser hors de ce plan
> sans validation du proprio.

## 1. Demande exacte du proprio (à respecter au mot près)

1. « analyse le frontend » → audit réel, pas de flatterie.
2. « les écrans s'entremêlent et l'ui est mauvaise tu n'as pas vu ça ? » → oui : double nav (header FR sombre vs sidebar EN claire), mélange FR/EN, sidebar blanche sur thème sombre.
3. « reprend le frontend complet design alignement ux et utilise les skills disponibles, lit les skills et applique-les strictement » avec :
   - `@.agents/skills/ui-ux-pro-max/`
   - `@.agents/skills/frontend-design/`
   - `@.agents/skills/copywriting/`
4. « tu n'as fait que la landing, je veux écran par écran avec de nouveaux onglets branchés sur l'api et toutes les fonctions avec nouvelle ui ux respectant strictement les skills »
5. « je m'en fiche par quoi tu commences mais change tout : sidebar, navbar, nouveau design token, layout et tout »
6. « relis les skills, applique-les strictement, oublie toute autre règle, je suis le proprio du code »
7. « bro change tout, n'utilise plus les presets de shadcn, je veux de l'exotic »
8. « en plus nettoie-moi ces vieux composants tous coincés »
9. « je suis toujours sans satisfaction, arrête-toi et écris dans un fichier plan tout ton plan de refonte + ma demande exacte de lecture de skills, un autre agent le fera » → **c'est ce fichier**.

Règle d'or posée par le proprio : **les skills priment sur toute autre règle** (y compris l'ancien brief rouge/noir Manrope et y compris les presets shadcn). En cas de conflit skill vs habitude repo, le skill gagne. En cas de conflit skill vs utilisateur, l'utilisateur gagne.

## 2. Lecture des skills — procédure EXACTE à exécuter

Ne pas se contenter d'avoir « entendu parler » des skills. Exécuter :

```bash
# 1. Lire les 3 contrats
cat .agents/skills/ui-ux-pro-max/SKILL.md
cat .agents/skills/frontend-design/SKILL.md
cat .agents/skills/copywriting/SKILL.md

# 2. Références obligatoires
cat .agents/skills/ui-ux-pro-max/references/quick-reference.md   # 119 règles, priorités 1→10
cat .agents/skills/ui-ux-pro-max/references/pro-rules.md         # checklist pré-livraison canonique
cat .agents/skills/copywriting/references/copy-frameworks.md     # headlines, sections, Human Action Model, "Now you can"

# 3. Design system (OBLIGATOIRE workflow ui-ux-pro-max Step 2) — déjà persisté :
ls design-system/gentube/MASTER.md   # le lire, c'est la source de vérité
# Si régénération autorisée par le proprio uniquement :
python3 ".agents/skills/ui-ux-pro-max/scripts/search.py" "AI video generator creator SaaS dark cinematic" --design-system -p "GenTube" --persist --output-dir "/home/precieux/gentube"

# 4. Compléments (1 intention dominante, 2-5 termes, 1 retry max si 0 résultat) :
python3 ".agents/skills/ui-ux-pro-max/scripts/search.py" "hero social-proof" --domain landing -n 2
python3 ".agents/skills/ui-ux-pro-max/scripts/search.py" "cinematic bold" --domain typography -n 2
python3 ".agents/skills/ui-ux-pro-max/scripts/search.py" "bottom nav limit" --domain ux -n 2
python3 ".agents/skills/ui-ux-pro-max/scripts/search.py" "streaming suspense" --stack nextjs
python3 ".agents/skills/ui-ux-pro-max/scripts/search.py" "tabs dashboard" --stack shadcn
```

Contrat de requête : `--design-system` pour direction visuelle globale, `--domain` pour un souci ciblé, `--stack` pour l'implémentation (stack détectée : **nextjs + shadcn**, cf. package.json : next 15.6 canary, react 19, tailwind 4, radix-ui/base-ui). Ne jamais persister un résultat non vérifié. Si 0 résultat : 1 retry resserré, sinon fallback explicite labellisé « défaut général, pas un match base ».

## 3. Direction verrouillée (issue des skills, pas d'un goût perso)

- **MASTER** : `design-system/gentube/MASTER.md` — style **AI-Native UI**, pattern **Hero + Testimonials + CTA** (Hero > Problem > Solution > Testimonials carousel > CTA), effets **typing 3-points, streaming text, pulse, reveals**.
- **Palette MASTER (6 hex)** : primaire `#7C3AED` / accent-CTA `#EC4899` / fond `#FAFAFA`-famille `#FAF5FF` / encre `#0F172A` / muted `#F7F3FD` / bordure `#EFE7FC`. Destructif `#DC2626`, ring `#7C3AED`.
- **Typo MASTER** : Inter seul (Display 700 tracking -1.5 / H 600 / body 400 16px/1.5 / labels 500 uppercase +1.2). Fini Manrope/Sora.
- **Design exotique décidé (frontend-design)** : direction **« salle de montage »** — vernaculaire pellicule : **perforation + timecode tabulaire + playhead**. C'est LA signature, dépensée à un seul endroit (cartes héro/tarifs, carousel). Tout le reste quiet et discipliné. Chanel : retirer un accessoire avant de sortir.
- **Critique assumée** : l'ancien rouge/noir = défaut générique n°2 du skill (near-black + vermillon). Abandonné sur ordre du proprio. Ne pas le restaurer sans son feu vert.
- **Copywriting** : 1 action/écran (landing = « Créer ma première vidéo »), Human Action Model (gêne → vision → chemin), test « Now you can », bénéfices > features, chiffres réels de `lib/credits/pricing.ts` + `lib/billing/plans.ts`, **zéro faux témoignage** (pas de noms/photos inventés → carousel de preuves chiffrées vérifiées à la place, avec contrôles prev/next + pause, stop focus/hover/reduced-motion, position annoncée, clavier complet).

## 4. État réel du chantier (sale — à assainir en premier)

Modifiés (git, 17 fichiers) :
- `app/globals.css` (362 lignes, passé au MASTER + dark dérivé), `app/layout.tsx` (Inter + meta FR),
- `app/(dashboard)/layout.tsx` (header global unique : logo + pastille crédits API + avatar),
- `app/(dashboard)/dashboard/layout.tsx` (shell neuve : sidebar desktop Créer/Espace + crédits API, bottom-nav mobile 4 items, skip-link),
- `app/(dashboard)/page.tsx` (landing réécrite ~570 lignes : pattern skill + Tabs custom + preuves),
- `app/(dashboard)/dashboard/projects/page.tsx` (onglets serveur Tous/Avec vidéos/Sans vidéo, `?onglet=`, deep-links),
- `app/(dashboard)/dashboard/videos/page.tsx` (filtres état unifiés shell + 44px),
- `projects/[id]`, `projects/new`, `videos/[id]/storyboard`, `activity`, `general`, `security`, `videos/[id]/actions`, `components/ui/button.tsx`, `components/ui/input.tsx`.

Créés non commités : `components/gx/` (5 primitifs exotiques), `components/landing-proof-carousel.tsx`, `design-system/`, `atlas.md`, `lib/billing/plafond.ts`.

DANGER : `lib/credits/pricing.ts`, `lib/credits/ledger.ts`, `lib/billing/plafond.ts` ont bougé sous les pieds (grille v1 : `secondsAffordable(credits, quality)`, `CREDITS_PER_SECOND: Record<Quality, number>`, plus de `'video'/'480p'`). **Ne pas toucher au métier.** Seul `app/(dashboard)/dashboard/page.tsx` a été réparé côté frontend pour la nouvelle signature. Le `typecheck` global reste rouge sur des tests métier préexistants (`flux.test`, `provider.test`, `render.test`, `geniuspay`…) — hors scope, ne pas se laisser aspirer.

## 5. Plan de refonte — phases dans l'ordre

**Phase 0 — Assainir (d'abord).**
1. `git stash` ou commit de sauvegarde ? Décision proprio. Au minimum lister le diff.
2. Geler le métier : `lib/credits`, `lib/billing`, `lib/videos`, `lib/storyboard` = lecture seule sauf bug bloquant frontend.
3. Valider que `pnpm typecheck` est vert sur : `app/(dashboard)/page.tsx`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/dashboard/layout.tsx`, `components/gx/*`, `components/landing-proof-carousel.tsx`.

**Phase 1 — Primitifs exotiques `components/gx/` (remplacent les presets shadcn).**
- Existants : `gx-button.tsx` (primary rose / secondary bordure violette 2px / ghost / dark, 3 tailles, 44px, hover -1px, focus ring), `gx-card.tsx` (`GxCard` quiet + `GxPerfCard` perforation + timecode + `GxCardTitle`), `gx-tabs.tsx` (custom, roving tabindex, flèches/Home/End, 44px), `gx-field.tsx` (`GxField` label+aide+erreur câblés + `GxInput`/`GxTextarea` 44px), `gx-badge-empty.tsx` (`GxBadge` pastille + `GxEmpty` invitation à agir).
- Restent à créer si besoin écran par écran : `gx-select` natif stylé (remplacer le `<select>` brut de shot-card), `gx-progress` (playhead fin, transform-only), `gx-menu` (remplacer dropdown-menu avatar), `gx-table` si ledger.
- Règles : natif + aria, pas de Radix/Base-UI dans gx, `cursor-pointer` partout cliquable, transitions 200ms transform/opacity uniquement, `prefers-reduced-motion` respecté, contraste 4.5:1, cibles 44×44, focus visible.

**Phase 2 — Nettoyage « vieux composants coincés ».**
- Audit établi : 13 presets réellement importés par app (`button, card, label, input, radio-group, textarea, badge, empty, avatar, separator, tabs, dropdown-menu, progress`) contre ~37 jamais importés hors `components/ui` interne.
- Candidats suppression (vérifiés sans import app, seul `sidebar.tsx` mort les référence) : `slider, squiggly-text, aspect-ratio, input-group, parallax-hero-images, spinner, sidebar, item, toggle-group, sheet, breadcrumb, message, popover, navigation-menu, bento-grid, chart, skeleton, tooltip-card, field, checkbox, alert, pagination, table, toggle, gooey-input, select, scroll-area, toast, kbd, collapsible, canvas-text, drawer, switch, tooltip`.
- Procédure : migrer UN écran vers gx → supprimer les presets devenus orphelins → `pnpm typecheck` → commit. Ne jamais supprimer `button/card/tabs/...` encore importés par un écran non migré.

**Phase 3 — Écran par écran (chaque écran = onglets branchés API + fonctions + nouvelle UX).**
Ordre conseillé : Projets (fait, à valider) → Vidéos (filtres `?etat=` faits, à passer en `GxTabs`+`GxCard`) → Vidéo `[id]` (storyboard : stepper + shot-cards + `GxField` + devis vivant) → Fabrication (6 cartes max + playhead + file) → Billing (Tabs Abos/Recharges sur `getBillingOverview`, `subscribe/topup`) → Espace/Compte/Sécu/Activité (`/api/user`, `/api/tenant`, actions login) → Auth + 404.
- Chaque écran : 1 H1, eyebrow, 1 CTA primaire, onglets = deep-links serveur (`?onglet=`, `?etat=`) OU `GxTabs` client avec `defaultValue` selon le cas (listes filtrables = serveur ; sections liées = `GxTabs`), états vides `GxEmpty` avec action, erreurs `role=alert` près du champ, nombres `tabular-nums`, dates `fr-FR`.
- API par écran : Projets `listProjects/getProject/createProject` + `listVideos` + `listClientAssets` + `getEntitlements` ; Vidéos `listVideos` + shots ; `[id]` `getStoryboard/listSounds/shotFormAction` ; Fabrication `listVideos` + shots ; Billing `getBillingOverview` + `/api/billing/*` ; Espace `/api/user` + `/api/tenant` + `invite/removeTenantMember` ; Compte `updateAccount` ; Sécu `updatePassword/deleteAccount` ; Activité `getActivityLogs`.

**Phase 4 — Finitions.**
- Passer la checklist `pro-rules.md` au complet (375px + paysage, reduced-motion + gros texte, dark contrast indépendant, 44pt, safe-areas, pas de contenu sous nav fixe, pas de scroll horizontal, pas d'emoji-icônes, une seule famille d'icônes Lucide, scrim mesuré).
- `pnpm typecheck` vert sur tout le scope frontend + `pnpm build` si possible. Laisser le rouge métier préexistant documenté, pas masqué.

## 6. Critères d'acceptation (le proprio valide)

- [ ] Zéro preset shadcn importé dans `app/` (que du `gx/` + natif).
- [ ] 1 seule navbar par niveau : globale (logo+crédits+avatar) + sidebar desktop + bottom-nav mobile ; landing sans header doublon (ancres seules).
- [ ] Chaque écran a ses onglets branchés sur la vraie API avec deep-links et comptes.
- [ ] `components/ui/` réduit aux seuls fichiers encore migrés ou supprimé.
- [ ] Checklist pro-rules cochée et notée dans le récap.

## 7. Fichiers à lire en premier (top 10)

1. `design-system/gentube/MASTER.md`
2. `app/(dashboard)/page.tsx` + `components/landing-proof-carousel.tsx` + `components/gx/*`
3. `app/globals.css`, `app/layout.tsx`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/dashboard/layout.tsx`
4. `app/(dashboard)/dashboard/projects/page.tsx`, `videos/page.tsx`
5. `lib/credits/pricing.ts` + `lib/billing/plans.ts` (lecture seule — grille réelle)
