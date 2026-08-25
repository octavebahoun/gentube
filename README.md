# GenTube

SaaS multi-tenant de génération vidéo IA : un projet définit un style, une voix
et une chaîne YouTube ; chaque vidéo part d'un storyboard généré, éditable en
kanban, validé par l'utilisateur, puis produit par un pipeline asynchrone.

Base : template officiel [Next.js SaaS Starter](https://github.com/nextjs/saas-starter)
de Vercel — auth, sessions, middleware et structure d'équipe conservés, **toute
la partie Stripe supprimée** — la facturation passe par GeniusPay (mobile money
et carte, en XOF).

**Stack** : Next.js 15 (App Router, TypeScript) · Drizzle ORM + PostgreSQL ·
Tailwind + shadcn/ui · déploiement Vercel.

---

## Démarrage

```bash
pnpm install
pnpm db:setup     # lance Postgres (Docker) et génère .env avec des secrets frais
pnpm db:migrate   # applique les migrations
pnpm db:seed      # 2 tenants de démo, projets, vidéo et storyboard
pnpm dev
```

Comptes créés par le seed (mot de passe `admin123` pour tous) :

| Email | Tenant | Rôle | Crédits |
|---|---|---|---|
| `owner@studio.test` | Studio Cotonou (pro) | owner | 3 000 |
| `editor@studio.test` | Studio Cotonou (pro) | member | — |
| `owner@demo.test` | Kanal Demo (starter) | owner | 1 333 |

### Commandes

| Commande | Effet |
|---|---|
| `pnpm dev` | serveur de développement (Turbopack) |
| `pnpm build` | build de production |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | suite Vitest (voir ci-dessous) |
| `pnpm db:setup` | Postgres Docker + `.env` |
| `pnpm db:generate` | génère une migration depuis `lib/db/schema.ts` |
| `pnpm db:migrate` | applique les migrations |
| `pnpm db:seed` | remplit la base de démo |
| `pnpm db:reset` | vide toutes les tables (dev uniquement) |
| `pnpm db:studio` | Drizzle Studio |

### Tests

`pnpm test` crée et migre une base **séparée** (`<votre_base>_test`) et la vide
entre chaque test — la base de développement n'est jamais touchée. Il faut donc
un `DATABASE_URL` valide et un Postgres accessible.

60 tests : isolation tenant, ledger de crédits, estimation, chiffrement.

---

## Isolation multi-tenant — `tenantDb()`

Règle non négociable : **aucune requête ne part sans filtre `tenant_id`**.
Le code applicatif n'importe jamais `db` ; il passe par un handle scopé.

```ts
import { requireTenantDb } from '@/lib/db/queries';
import { projects } from '@/lib/db/schema';

const tdb = await requireTenantDb();      // tenant déduit de la session
await tdb.insert(projects, { name: 'Ma chaîne' });   // tenant_id posé d'office
await tdb.findMany(projects);                        // WHERE tenant_id = …
```

Ce que le wrapper garantit (`lib/db/tenant-db.ts`, testé dans
`lib/db/tenant-db.test.ts`) :

- `findMany` / `findFirst` / `findById` / `count` / `update` / `delete`
  reçoivent tous le filtre tenant, **y compris** quand l'appelant fournit son
  propre `where` — les deux sont combinés en `AND`.
- `insert` pose le `tenant_id` lui-même ; fournir celui d'un autre tenant lève
  `TenantScopeViolationError`.
- `update` refuse de déplacer une ligne vers un autre tenant.
- Une table sans colonne `tenant_id` est **rejetée à l'appel**, pas exécutée
  sans filtre.
- `transaction()` transmet le scope à la transaction.
- Un test parcourt le schéma et échoue si une nouvelle table oublie
  `tenant_id`.

**Conséquence sur le schéma** : `tenant_id` est dénormalisé sur *toutes* les
tables possédées par un tenant, y compris celles qui sont déjà rattachées par
une clé étrangère (`shots → videos → projects → tenant`). C'est ce qui rend la
règle applicable en une seule clause `WHERE` plutôt qu'en chaîne de jointures.

Deux requêtes tournent volontairement sans scope, et une seule fois chacune :
la résolution de session (`getUser`, clé sur l'id du cookie signé) et le
bootstrap d'inscription (création du tenant, qui n'existe pas encore). Les deux
sont commentées dans le code.

---

## Crédits

Unité (specs §1) : **1 crédit = 1 seconde de vidéo générée en 480p**, 720p à
4 crédits/seconde. Tout est dans `lib/credits/`.

- `pricing.ts` — barème, estimation, coût provider. Aucun nombre de tarification
  ailleurs dans le code.
- `ledger.ts` — mouvements de crédits, tous passés par `credit_ledger`.

```ts
await estimateVideo(tdb, videoId);          // estime, n'écrit rien au solde
await validateAndChargeVideo(tdb, videoId); // débite ET passe en `validated`
await refundVideo(tdb, videoId);            // rembourse un pipeline échoué
```

Garanties :

- **Blocage à zéro** : le débit est un `UPDATE … WHERE credits_balance >= montant`.
  Si le solde ne suffit pas, aucune ligne n'est modifiée, rien n'est écrit au
  ledger et `InsufficientCreditsError` est levée. Le solde ne peut pas devenir
  négatif, y compris sous débits concurrents (test dédié).
- **Débit à la validation, jamais avant** : `validateAndChargeVideo` est le seul
  chemin qui fait sortir une vidéo de `draft`, et débit + changement de statut
  partagent une transaction.
- **Idempotence** : les mouvements pilotés par webhook portent une
  `idempotency_key` unique — un rejeu renvoie l'écriture existante au lieu de
  créditer deux fois.
- **Invariant** : `somme(credit_ledger.delta) == tenants.credits_balance`.

### ⚠️ Incohérence tarifaire dans les specs

La colonne « Crédits » du tableau §1 ne tient pas avec l'unité définie dans la
même section :

- Starter = 10 000 crédits = 10 000 s en 480p = **166 min**, alors que la même
  ligne annonce ~23 min — et 10 000 s coûtent ~$120 de Replicate pour un
  abonnement à 15 000 FCFA (~$24).
- Les chiffres retombent juste si cette cellule est le **budget compute en
  FCFA** (prix du plan moins la part plateforme), pas un nombre de crédits :
  Starter 15 000 − 5 000 = 10 000 FCFA ≈ $16 → $16 / $0,012 = 1 333 s ≈ 22 min ✓
  et Pro 22 000 FCFA ≈ $35 → 2 933 s ≈ 49 min ✓ — ce qui correspond exactement à
  la colonne « ~480p ».

`PLAN_MONTHLY_CREDITS` retient donc **1 333 (Starter) / 3 000 (Pro)**. Un test
vérifie que ces allocations correspondent bien aux minutes annoncées.

Le pack de recharge est laissé tel que spécifié (5 000 FCFA = 3 000 crédits)
mais il est **vendu à perte** : 3 000 s en 480p ≈ $36 de coût pour ~$8 encaissés.
L'équilibre serait autour de 450 crédits. `topUpMarginFcfa()` calcule la marge,
et un test la signale tant qu'elle est négative. Le pack est désormais
**achetable en ligne** : à trancher avant d'ouvrir les inscriptions, le prix se
change dans `pricing.ts` et nulle part ailleurs.

---

## Projets

Un projet porte le **style**, la **voix**, la **chaîne YouTube** et le
**pipeline par défaut** ; chaque vidéo est créée dedans et en hérite. Tout est
dans `lib/projects/`, et les pages sont sous `/dashboard/projects`.

```ts
await listProjects(tdb);              // + nombre de vidéos par projet
await createProject(tdb, input);      // zod : nom requis, pipeline dans l'enum
await updateProject(tdb, id, patch);  // champ absent = inchangé
await deleteProject(tdb, id);         // refusé si le projet contient des vidéos
```

Quatre règles, chacune testée :

- **« Not found », jamais « forbidden ».** Un id appartenant à un autre tenant
  répond exactement comme un id inexistant, en lecture, en écriture et en
  suppression : la page ne peut pas servir à deviner ce qui existe ailleurs.
- **Champ vide = champ effacé.** Un formulaire poste toujours tous ses champs ;
  une valeur vide devient `null`, jamais la chaîne vide. Sur une mise à jour, un
  champ *absent* reste inchangé.
- **Suppression refusée si le projet contient des vidéos.** Elles portent des
  crédits consommés, des assets rendus et des ids YouTube publiés — un clic ne
  doit pas détruire du travail payé. Le message donne le nombre de vidéos.
- **Suppression réservée aux `owner` / `admin`.** Créer et configurer reste
  ouvert à tout membre du workspace.

`voice_id` et `youtube_channel_id` sont stockés mais **pas encore consommés** :
la voix off et l'OAuth YouTube arrivent plus tard. L'UI le dit, plutôt que de
laisser croire qu'un champ rempli déclenche quelque chose.

---

## Storyboard

Un storyboard est une liste de scènes attachée à une vidéo. Chaque scène porte
**la narration** (le texte lu), un **prompt visuel** en anglais, un type
(`image` ou `video`), et son habillage : zoom, transition, mouvement de caméra,
bruitages. `lib/llm/`, `lib/voice/`, `lib/videos/`, `lib/storyboard/`, et
l'éditeur sur `/dashboard/videos/[id]`.

### L'ordre du pipeline, et pourquoi il compte

```
1. le LLM écrit la NARRATION de chaque scène (+ prompt visuel, effets, sons)
2. la voix off est générée  → sa longueur réelle devient la durée de la scène
3. c'est cette durée qui donne le prix EXACT
4. seulement ensuite : génération des visuels, qui coûtent cher
```

**Une durée n'est jamais écrite à la main.** Avant que l'audio existe, elle est
*estimée* depuis le texte (~14 caractères/seconde, calibré sur des voix off
réellement mesurées : 69 caractères pour 5,28 s, 64 pour 4,82 s, 104 pour
6,79 s). Après, elle est *mesurée* sur l'alignement renvoyé par ElevenLabs.
La colonne `shots.duration_source` dit laquelle des deux, et
`validateStoryboard()` **refuse de débiter** tant qu'une seule scène est encore
une estimation.

La conséquence est le seul vrai arbitrage de cette étape : la voix off tourne
**avant** le paiement. Elle coûte des centimes là où un clip vidéo coûte des
dizaines de centimes, et en échange le montant affiché sur le bouton est le
montant débité — pas d'écriture de correction dans le ledger d'un client.

### Le LLM : DeepSeek

API compatible OpenAI. Deux choses ont été **vérifiées sur le compte** plutôt
que supposées, et les deux comptent :

- Les modèles sont `deepseek-v4-flash` et `deepseek-v4-pro`. `deepseek-chat`
  n'existe pas ici.
- Ce sont des **modèles à raisonnement**. Avec un budget serré, tout part dans
  le raisonnement et l'appel revient en HTTP 200, `finish_reason: "length"`,
  **contenu vide**. D'où `DEEPSEEK_MAX_TOKENS` large (8 000) et un message
  d'erreur qui nomme ce cas au lieu de rapporter « réponse vide ».

Le prompt système est invariant et placé en premier, pour que le cache de
prompt du fournisseur puisse le réutiliser.

### Ce qui n'est jamais laissé au modèle

- **Le type des scènes.** Sur un projet `image`, une scène revenue en `video`
  est ramenée à `image` côté serveur : le modèle n'a pas le droit de quadrupler
  la facture du client.
- **Les durées.** Il lui est explicitement interdit d'en écrire une.
- **Les chemins de sons.** Un `src` absent de la bibliothèque est supprimé. Un
  son inventé ne casserait pas ici mais dans Lambda, plusieurs minutes plus tard.
- **La forme.** Validation zod ; une réponse inutilisable lève une erreur claire
  et **ne touche pas au storyboard existant**.

### La bibliothèque de sons

`sound_assets` est un catalogue **au niveau plateforme** : SFX, ambiances et
nappes musicales, avec leurs pics d'impact en secondes. C'est la deuxième et
dernière table sans `tenant_id` — elle n'appartient à personne, comme une liste
de polices, et le test d'isolation l'énumère comme telle.

Le catalogue voyage dans le prompt (borné à 60 entrées) pour que le modèle
choisisse dedans. Import depuis un catalogue généré :

```bash
pnpm tsx lib/sounds/import-catalog.ts ../pipevideo/public/sounds/CATALOG.md
```

Importer les lignes rend les sons **choisissables** ; les fichiers doivent
encore atteindre R2 sous les mêmes clés pour être **jouables**.

### Le contrat de rendu

`lib/storyboard/render.ts` est le portage fidèle du schéma de storyboard déjà en
production dans le pipeline pipevideo : `effects` (9 transitions, zoom, shake,
matchCut, cameraMotion, flash), `overlayText`, `kineticTitle`, `card`, `sounds`,
volumes, et le modèle de temps (30 fps, 1 s de silence après chaque narration,
transitions qui se chevauchent). `toHyperframesStoryboard()` sérialise
`videos` + `shots` vers exactement ce JSON, pour que la composition
existante soit réutilisée sans traduction.

L'habillage vit dans une colonne `render` en jsonb, validée par zod : ajouter
une transition ou une variante de titre est un déploiement, pas une migration.

### Règles d'édition

- Seule une vidéo en `draft` est modifiable.
- **Réécrire la narration invalide la voix off** : l'audio ne dit plus ce que la
  scène dit, donc la durée redevient une estimation et la piste enregistrée est
  effacée. Changer seulement le visuel ne touche pas à l'audio.
- Chaque mutation repropose le prix dans la même transaction.
- Une suppression recompacte les positions 1..n.
- Le réordonnancement exige la liste **exacte** des scènes.
- Une scène appartenant à une autre vidéo du même tenant est refusée en 404.

### Le kanban

Réordonnancement par flèches ↑/↓, pas de glisser-déposer. Le drag reste à faire
(`@dnd-kit/sortable`) et se posera par-dessus `reorderShots(videoId, orderedIds)`
sans toucher au serveur.

---

## Facturation — GeniusPay

Abonnements mensuels (Starter 15 000 / Pro 30 000 FCFA) et recharges ponctuelles,
en XOF, par mobile money ou carte. Tout est dans `lib/billing/` et
`lib/payments/geniuspay.ts`.

### La configuration est écrite à la main

Il n'y a **ni table de credentials, ni écran d'administration des prix** :

- les clés de la passerelle sont des variables d'environnement (`lib/billing/config.ts`) ;
- le catalogue — plans, prix, crédits accordés, packs — est un fichier de
  constantes (`lib/billing/plans.ts`) qui ne fait que réexposer `lib/credits/pricing.ts`.

La plateforme n'a qu'**un seul compte marchand** : les tenants la paient, ils
n'encaissent rien. Le pattern chiffré par organisation de Contravo n'a donc pas
lieu d'être ici. Ce qu'un client paie et ce qu'il reçoit se relisent dans un
diff, pas dans une ligne de base modifiable à chaud.

### Aucun crédit accordé au checkout

`lib/billing/checkout.ts` crée les lignes locales (`payment_intents`,
`billing_cycles`, `payment_attempts`) et renvoie l'URL de paiement. Le plan du
tenant ne change pas, le solde ne bouge pas. La configuration est vérifiée
**avant** la première écriture : une instance mal configurée répond « non
configuré » au lieu de laisser des lignes orphelines derrière elle.

### Le webhook, dans cet ordre

`lib/billing/webhook.ts`, appelé par `POST /api/webhooks/geniuspay` :

| Étape | Effet d'un échec |
|---|---|
| 1. corps JSON valide | `400`, rien écrit |
| 2. horodatage dans ±300 s | `400`, rien écrit |
| 3. **signature HMAC** | `401`, **rien écrit** |
| 4. journalisation, unique sur `event_id` | rejeu déjà traité → `200` sans effet |
| 5. tenant résolu depuis **notre** `payment_intents` | référence inconnue → `200` |
| 6. **re-fetch** du paiement chez GeniusPay | `502`, la passerelle rejouera |
| 7. statut, montant et devise comparés à l'intent | `200`, aucun crédit |
| 8. crédit + cycle + plan, en une transaction | — |

Deux écarts assumés par rapport au pipeline Contravo :

- **Signature avant journalisation.** Contravo journalise d'abord, pour l'audit.
  Écrire avant de vérifier offre une table à remplir à n'importe quel appelant
  non authentifié — et les specs demandent explicitement « 401 sans rien
  écrire ». Un callback forgé ne laisse donc aucune trace.
- **Rejeu autorisé tant que `processed_at` est nul.** Un événement vérifié qui
  échoue en aval (passerelle injoignable) doit pouvoir être rejoué. La clé
  d'idempotence du ledger est dérivée de la **référence de paiement**, pas de
  l'id d'événement : deux événements distincts pour le même paiement ne
  créditent qu'une fois.

Le tenant est toujours résolu depuis la référence de paiement stockée par nous,
**jamais depuis `metadata`** — un webhook qui prétend appartenir à un autre
tenant crédite quand même le bon (test dédié).

### Échecs et suspension

Un paiement échoué marque la tentative, passe l'abonnement en `past_due` et
laisse le cycle ouvert pour un nouvel essai. Au bout de
`MAX_PAYMENT_ATTEMPTS` (3) tentatives échouées sur le même cycle, le cycle passe
`failed` et l'abonnement `suspended`. La suspension **arrête le renouvellement,
elle ne confisque rien** : le solde acheté reste acquis, et un nouveau paiement
ouvre un cycle neuf — un tenant suspendu peut toujours revenir seul.

### Le seul accès non scopé du code

Le webhook arrive sans session : le tenant est ce qu'il *résout*. Les deux
lectures/écritures non scopées de `lib/billing/webhook.ts` (journal d'événements
et résolution de l'intent par sa référence) sont la même exception que
`getUser()`, et elles s'arrêtent là — tout ce qui touche à l'argent passe par
`tenantDb()`.

---

## Schéma

15 tables (`lib/db/schema.ts`), migrations dans `lib/db/migrations/`.

| Table | Rôle |
|---|---|
| `tenants` | tenant : nom, plan, solde de crédits |
| `users` | utilisateur rattaché à un tenant, rôle `owner\|admin\|member` |
| `invitations`, `activity_logs` | héritées du template, passées en tenant |
| `projects` | style, voix, chaîne YouTube, pipeline par défaut |
| `videos` | titre, statut, résolution, crédits estimés/consommés, id YouTube |
| `shots` | plan du storyboard : ordre, type, prompt, durée, asset |
| `jobs` | étape de pipeline, id externe, statut, payload, erreur |
| `credit_ledger` | tous les mouvements de crédits |
| `youtube_tokens` | tokens OAuth chiffrés AES-256-GCM |
| `subscriptions` | un abonnement par tenant : plan, statut, période courante |
| `billing_cycles` | une période facturée : montant XOF, crédits du cycle, statut |
| `payment_attempts` | tentatives de paiement d'un cycle (c'est ce qui rend « retry puis suspend » comptable) |
| `payment_intents` | paiement vu de la passerelle : référence unique, montant, crédits promis |
| `payment_webhook_events` | journal des webhooks vérifiés, unique sur `event_id` — la garantie d'idempotence |

États d'une vidéo : `draft → validated → generating → rendering → rendered →
published`, plus `failed` (ajouté : sans lui, un crash de pipeline laisse une
vidéo bloquée en `generating`).

Deux colonnes ajoutées par rapport aux specs, parce que le reste en dépend :
`videos.resolution` (le barème de crédits en a besoin) et `jobs.external_id`
en index **unique** (un webhook rejoué doit résoudre vers un seul job).

---

## Chiffrement

`lib/crypto/encryption.ts` — AES-256-GCM, IV aléatoire par appel, tag
d'authentification vérifié au déchiffrement, format versionné `v1:…`.

```ts
import { encrypt, decrypt } from '@/lib/crypto/encryption';
```

La clé vient de `ENCRYPTION_KEY` (32 octets, hex ou base64) et est résolue
paresseusement — importer le module ne casse pas un build sans clé. **La faire
tourner rend tous les tokens stockés indéchiffrables** : les tenants devront
reconnecter leur chaîne.

`safeEqual()` est fourni pour les comparaisons de signatures de webhooks
(Replicate, GeniusPay) en temps constant.

---

## Variables d'environnement

Voir `.env.example`, documenté ligne par ligne. `pnpm db:setup` en génère un
`.env` avec `AUTH_SECRET` et `ENCRYPTION_KEY` déjà remplis ; les clés provider
restent vides, aucune n'est nécessaire à cette étape.

`DATABASE_URL`, `BASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `R2_*`,
`REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`,
`CLOUDFLARE_AI_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `YOUTUBE_CLIENT_ID`,
`YOUTUBE_CLIENT_SECRET`, `N8N_WEBHOOK_SECRET`, `N8N_BASE_URL`.

### Facturation

Les clés sandbox et live cohabitent sous leurs propres noms, et `GENIUS_ENV`
(`sandbox` par défaut) désigne le jeu actif :

```
GENIUS_ENV=sandbox|live
GENIUS_URL_ENDPOINT=https://geniuspay.ci/api/v1/merchant
GENIUS_SANDBOX_API_KEY / _SECRET_KEY / _WEBHOOK_SECRET
GENIUS_LIVE_API_KEY    / _SECRET_KEY / _WEBHOOK_SECRET
```

Passer en production, c'est **ajouter** trois variables et basculer `GENIUS_ENV`
— aucun renommage, les clés sandbox restent en place. Un jeu ne peut pas
satisfaire l'autre : en `live`, les clés sandbox ne sont même pas lues, et
l'erreur nomme les variables de l'environnement actif.

Les trois secrets d'un jeu sont exigés **ensemble**. Sans le secret de webhook,
un checkout aboutirait, le client paierait, et rien ne créditerait jamais son
solde faute de pouvoir vérifier la confirmation.

Toute valeur de `GENIUS_ENV` autre que très exactement `live` vaut `sandbox` :
passer en réel est un acte explicite, jamais une faute de frappe. Et c'est la
**clé** qui décide du bac à sable, pas la variable — une clé `live` rangée sous
un nom `GENIUS_SANDBOX_*` lève une erreur à la construction du client plutôt que
d'encaisser pour de vrai dans ce que tout le reste appelle une simulation.

Webhook à déclarer côté GeniusPay : `${BASE_URL}/api/webhooks/geniuspay`.

---

## Règles d'architecture à tenir

- **Aucun appel long dans Next.js.** On crée un `job` et on rend la main ;
  n8n exécute, les webhooks font avancer l'état.
- **n8n ne touche jamais Postgres.** Il passe par des routes API internes
  signées avec `N8N_WEBHOOK_SECRET`.
- **Assets sur R2, préfixe `tenant_id/` obligatoire**, URLs signées à durée
  courte, bucket privé.
- **Webhooks entrants signés** (Replicate, GeniusPay) : signature vérifiée
  avant toute écriture, `idempotency_key` sur les mouvements de crédits.

---

## Pas encore implémenté

Volontairement hors périmètre pour l'instant : Replicate, Hyperframes, YouTube,
ElevenLabs et l'orchestration n8n. Le schéma, les crédits, l'isolation, la
facturation, les projets et le storyboard sont en place pour les recevoir.

**Stockage R2 — fait.** `lib/storage/index.ts` porte le contrat (`AssetStore`,
`assetKey` avec préfixe `tenant_id/` obligatoire) et `lib/storage/r2.ts`
l'implémente sur Cloudflare R2. Rien n'est public : tout se lit par une URL
signée de quinze minutes. `StorageNotConfiguredError` nomme les variables
manquantes plutôt que d'échouer plus tard sur un appel réseau opaque.

Les tests ne peuvent pas l'atteindre : `lib/test/setup.ts` vide les variables
`R2_*`. Sans ce garde-fou, un test qui oublie d'injecter un store factice écrit
dans le bucket de production — c'est arrivé dès la première exécution.

**Glisser-déposer du kanban.** Le réordonnancement se fait aux flèches ; le
drag-and-drop des specs reste à poser par-dessus le même appel serveur.

**Templates Hyperframes.** Le contrat est porté et exprimé en secondes
(`lib/storyboard/render.ts`) : `toHyperframesStoryboard()` produit les
positions absolues, les dimensions et la durée totale. Les templates
HTML/CSS/GSAP qui les consomment restent à écrire, avec
`@hyperframes/shader-transitions` pour les transitions.

Les paquets ne sont pas encore installés. **Quand ils le seront, ils doivent
être épinglés à la version exacte** : `@hyperframes/*` est en 0.8.x, publié
plusieurs fois par jour. Un `^` sur du 0.x accepte des ruptures en silence.

**Expiration du quota de plan.** Les specs §1 disent que les crédits achetés
n'expirent pas mais que le quota du plan expire en fin de cycle. Le crédit du
cycle est bien accordé et tracé (`billing_cycles.credits_granted`), mais rien ne
l'expire : il faudrait distinguer crédits de plan et crédits achetés dans le
ledger, et une tâche planifiée pour les périmer. À arbitrer — en l'état, un
crédit non consommé reste acquis.

**Résiliation / rétrogradation self-service.** `subscriptions.cancel_at` existe
dans le schéma, aucune route ne l'écrit encore.

Un point à traiter tôt : le quota YouTube Data API est de 10 000 unités/jour
**par projet Google Cloud**, et un upload en coûte 1 600 — soit ~6 publications
par jour pour l'ensemble des tenants, pas par tenant. La demande d'augmentation
de quota passe par une revue Google qui prend des semaines.
