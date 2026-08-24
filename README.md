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

Volontairement hors périmètre pour l'instant : Replicate, Remotion, YouTube,
ElevenLabs, le CRUD projets/vidéos et le kanban de storyboard. Le schéma, les
crédits, l'isolation et la facturation sont en place pour les recevoir.

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
