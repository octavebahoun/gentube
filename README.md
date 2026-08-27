# GenTube

SaaS multi-tenant de génération vidéo IA : un projet définit un style, une voix
et une chaîne YouTube ; chaque vidéo part d'un storyboard généré, éditable en
kanban, validé par l'utilisateur, puis produit par un pipeline asynchrone.

Base : template officiel [Next.js SaaS Starter](https://github.com/nextjs/saas-starter)
de Vercel — auth, sessions, middleware et structure d'équipe conservés, **toute
la partie Stripe supprimée** — la facturation passe par GeniusPay (mobile money
et carte, en XOF).

**Pile** : Next.js 15 (App Router, TypeScript) · Drizzle ORM + PostgreSQL ·
Tailwind, `@base-ui/react` et `radix-ui` · Cloudflare R2 pour les assets et
Workers AI pour les images · AWS Lambda et Step Functions pour le montage ·
DeepSeek pour le texte · Edge TTS, Amazon Polly et ElevenLabs pour la voix.

L'app se déploie sur Vercel, le montage tourne sur Lambda. Un Chrome et un
FFmpeg qui travaillent trente secondes par vidéo ne justifient pas un serveur
payé à l'année, et une vidéo se découpe en morceaux rendus en parallèle.

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
| `owner@studio.test` | Studio Cotonou (pro) | owner | 5 400 |
| `editor@studio.test` | Studio Cotonou (pro) | member | — |
| `owner@demo.test` | Kanal Demo (starter) | owner | 2 640 |

Si `DATABASE_URL` désigne une base distante (Supabase), pose aussi
`TEST_DATABASE_URL` sur le Postgres local : la suite de tests refuse de tourner
ailleurs qu'en local, et elle a raison de le faire (voir « Tests »).

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
| `pnpm db:status` | lecture seule : combien des migrations du dépôt sont appliquées, et quelles tables existent |
| `pnpm db:studio` | Drizzle Studio |

### Tests

`pnpm test` crée et migre une base **séparée** (`<votre_base>_test`) et la vide
entre chaque test. La base de développement n'est jamais touchée.

**392 tests** : isolation tenant, grand livre de crédits, tarification,
facturation GeniusPay, storyboard, voix off, images, montage, chiffrement.

Deux garde-fous, tous deux nés d'un incident réel :

- `lib/test/database.ts` **refuse** un hôte de base autre que `localhost`. La
  suite tronque chaque table entre chaque test ; pointée sur une base distante
  elle la viderait. `TEST_DATABASE_URL` sert à garder les tests en local quand
  l'app parle à Supabase, et `ALLOW_REMOTE_TEST_DATABASE=1` lève le garde-fou
  pour un conteneur de CI jetable.
- `lib/test/setup.ts` vide les variables de **tous** les fournisseurs payants et
  coupe Edge TTS. Sans ça, un test qui oublie d'injecter un double appelle le
  vrai service. C'est exactement ce qui est arrivé le jour où l'adaptateur R2 a
  existé : deux objets écrits dans le bucket de production.

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

Unité : **1 crédit = 1 seconde d'image fixe en 480p.**

| | 480p | 720p |
|---|---|---|
| Plan en image fixe | 1 crédit/s | 3 crédits/s |
| Plan animé | 2 crédits/s | 6 crédits/s |

Un plan animé coûte le double parce qu'il nous coûte réellement bien plus : à
peu près 400 FCFA la minute contre 30 pour des images fixes. Au même tarif, les
clients « diaporama » paieraient la vidéo générée. Tout est dans `lib/credits/`,
chiffrage complet dans `docs/tarifs.md`.

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

### Tarifs retenus

Chiffrés le 25 août 2026, détaillés dans `docs/tarifs.md` :

- **Starter** 15 000 FCFA/mois = **2 640 crédits**, soit 22 min animées ou
  44 min d'images fixes en 480p (marge 41 %). Voix Amazon Polly Neural.
- **Pro** 30 000 FCFA/mois = **5 400 crédits**, soit 45 min animées ou 90 min
  d'images (marge 40 %). Voix ElevenLabs.
- **Business** sur devis.
- **Recharge** 5 000 FCFA = **720 crédits**, plus chère à la minute que
  l'abonnement, volontairement.
- **Essai gratuit** 120 crédits à l'inscription, 480p et filigrane. Au pire
  400 FCFA de coût par compte créé : c'est un budget publicitaire.

Un test vérifie que les dotations correspondent aux minutes annoncées et que le
pack de recharge ne repasse jamais en perte.

### Deux poches, pas un solde

Les crédits du plan **expirent** en fin de cycle, les crédits achetés jamais.
`tenants.credits_balance` est la somme dénormalisée de `credits_plan` et
`credits_topup`, et un débit vide la poche qui expire d'abord. L'expiration est
codée dans `lib/credits/ledger.ts`, avec une clé d'idempotence dérivée de la
date d'échéance pour qu'un passage rejoué ne périme pas deux fois.

Un écran qui n'afficherait qu'un seul nombre cacherait la seule information qui
compte : ce qui va disparaître à la fin du mois.

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

`voice_id` est consommé : la voix off d'une vidéo qui n'en nomme pas hérite de
celle du projet. `youtube_channel_id` est stocké mais **pas encore utilisé**,
l'OAuth YouTube n'existant pas. L'UI le dit, plutôt que de laisser croire qu'un
champ rempli déclenche quelque chose.

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
2. Edge TTS lit chaque phrase, GRATUITEMENT → sa longueur devient la durée
3. c'est cette durée qui donne le prix EXACT, affiché sur le bouton
4. le client valide : le débit a lieu une fois, et il est figé
5. la voix du plan (Polly ou ElevenLabs) remplace la voix de mesure
6. les visuels, qui coûtent cher
7. le montage sur Lambda
```

**Une durée n'est jamais écrite à la main.** Avant que l'audio existe, elle est
*estimée* depuis le texte (~14 caractères/seconde, calibré sur des voix off
réellement mesurées : 69 caractères pour 5,28 s, 64 pour 4,82 s, 104 pour
6,79 s). Après, elle est *mesurée* sur les timings mot à mot de la voix. La
colonne `shots.duration_source` dit laquelle des deux, et
`validateStoryboard()` **refuse de débiter** tant qu'une seule scène est encore
une estimation.

C'est le seul vrai arbitrage de cette étape : la voix tourne **avant** le
paiement. En échange, le montant affiché sur le bouton est le montant débité,
et aucune écriture de correction n'apparaît jamais dans le grand livre d'un
client.

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

### L'éditeur

Glisser-déposer avec `@dnd-kit/sortable`, prix par scène, et une bascule visible
entre durée estimée et durée mesurée. Le drag passe par
`reorderShotsAction`, qui appelle `reorderShots(videoId, orderedIds)` : le
serveur exige la liste exacte des scènes, donc un réordonnancement partiel est
refusé au lieu d'être devine.

---

## Voix off — deux passes, une seule facture

C'est la partie la moins devinable du produit, et elle vient d'une contrainte de
caisse. Le prix est la somme des durées, une durée s'obtient en faisant lire la
phrase, donc il faut parler **avant** que le client valide. Y compris pour les
devis qui n'aboutiront jamais. Payer Polly ou ElevenLabs à ce moment-là, c'est
payer chaque devis.

**Passe 1, mesurer** (`lib/voice/edge.ts`). Edge TTS, le service de lecture à
voix haute du navigateur Edge. Gratuit, sans clé, et il renvoie des *word
boundaries*, donc les timings mot à mot. Cette passe fixe le prix.

**Passe 2, livrer** (`lib/voice/polly.ts`, `lib/voice/elevenlabs.ts`). Après
validation, la voix du plan. Elle écrase le même objet R2 et refait les timings,
qui doivent suivre la voix réellement entendue. `shots.voice_provider` dit qui a
parlé, pour qu'une reprise ne repaie pas le fournisseur.

Le routage vit dans `lib/voice/index.ts`. Un fournisseur mal configuré **lève**
au lieu de basculer sur l'autre : une bascule silencieuse ferait payer la voix
premium sur un plan Starter, ou servirait la voix d'entrée de gamme à qui a payé
l'autre.

**Le prix ne bouge jamais après la validation.** Si la voix livrée dure un peu
plus longtemps, la scène s'allonge pour que le renderer ne coupe pas un mot, et
l'écart est pour nous. Elle ne raccourcit jamais sous ce qui a été payé.

### La durée, et deux pièges qui coûtaient de l'argent

Polly ne dit ni la longueur de son audio, ni la fin du dernier mot : un *speech
mark* ne porte qu'un instant de départ. La durée est donc lue dans les en-têtes
de trames du mp3 (`lib/voice/mp3.ts`), sans dépendance audio.

Deux corrections trouvées en comparant ce lecteur à `ffprobe` :

- la trame qui porte l'en-tête Xing n'est pas de l'audio, elle existe pour être
  lue et pas pour être entendue ;
- LAME déclare le silence qu'il ajoute en tête et en queue.

Sans les deux, chaque scène était surfacturée de 75 millisecondes.

Et pour Edge, la durée retenue est celle de la **parole**, pas celle du fichier :
mesuré sur un vrai appel, 6,12 s de mp3 pour 5,24 s de voix. Facturer le fichier
aurait surfacturé de 17 %.

Deux avertissements. Chez Polly les timings se demandent dans un second appel,
facturé comme un appel de synthèse. Et Edge TTS n'est pas une API publique : ni
contrat, ni garantie de stabilité, et il se trouve sur le chemin du prix.

---

## Images — Flux sur Cloudflare Workers AI

`lib/images/flux.ts` et `lib/storyboard/images.ts`. Modèle
`@cf/black-forest-labs/flux-2-klein-4b`. Coût mesuré : 0,00045 $ une image en
480p, 0,00101 $ en 720p.

Une image est générée pour **chaque** scène, animée comprise : Wan fait de
l'image-to-video, donc la fixe est la matière première du clip. D'où deux
colonnes, `shots.source_image_url` et `shots.asset_url`.

Trois choses vérifiées contre l'API plutôt que supposées :

- **Le corps doit être du `multipart/form-data`.** Un POST JSON est refusé par un
  message qui ne dit pas de changer d'encodage.
- **Les dimensions sont rabaissées au multiple de 16 inférieur**, en silence. On
  a demandé 854×480 et reçu 848×480. Toutes nos trames sont donc des multiples
  de 16.
- **Un prompt vide est accepté et facturé.** Le client le refuse avant l'appel
  réseau.

Pourquoi pas `flux-1-schnell`, plus connu : il ne prend pas de dimensions et
rend du carré 1024×1024. On paierait des pixels pour les jeter, et le sujet
cadré par le prompt sortirait du champ une fois sur deux.

### Le défaut vient des prompts, pas du modèle

Une demande de « mains en prière sur une table » sans mentionner la personne
produit des mains coupées : le modèle ne cadre que ce qu'on nomme. D'où six
règles imposées au LLM (`docs/providers.md`) : décrire le sujet entier avant le
cadrage, nommer le plan, situer décor et lumière en une phrase, un seul sujet
principal, éviter les mains détaillées, le texte dans l'image et les foules, en
anglais et de 20 à 40 mots.

---

## Plans animés — Replicate

Pas encore codé, décisions arrêtées le 28 août 2026 dans `docs/providers.md`.

| Résolution ou usage | Modèle | Prix |
|---|---|---|
| 480p | `wan-video/wan-2.2-i2v-fast` | 0,05 $ le clip de 5 s |
| 720p | `prunaai/p-video` | 0,02 $ la seconde |
| Avatar, lip-sync | `prunaai/p-video-avatar` | 0,025 $ la seconde |

Une couche `lib/video/provider.ts` choisira le modèle, sur le modèle du routage
de voix. Wan reste deux fois moins cher sur la résolution par défaut, p-video
prend le dessus en 720p et sera seul à pouvoir servir du 1080p.

**Une scène animée dure entre 5 et 10 secondes**, et les deux bornes viennent
d'endroits différents. Wan facturant au clip, une scène de 3 secondes coûte le
prix d'une de 5 : le plancher protège la marge. Le plafond de dix secondes est
une limite de p-video.

Replicate plutôt qu'un GPU loué : modèles toujours chauds, facturation par
sortie connue d'avance, exécutions échouées non facturées, et 600 créations de
prédiction par minute. Les quinze clips d'une vidéo partent en parallèle au lieu
de prendre dix minutes en file.

Un piège de compte qui ne dit pas son nom : Replicate **ralentit
progressivement** quand le crédit s'épuise, jusqu'à une requête par seconde sans
moyen de paiement enregistré. Aucune erreur, juste des générations lentes.

---

## Montage — HyperFrames sur AWS Lambda

HTML plus Chrome headless plus FFmpeg. `render/gentube-v1/` est le projet de
composition ; son `index.html` est **généré à chaque rendu** par
`lib/render/composition.ts`, parce qu'une composition GenTube a autant de scènes
que son storyboard.

```ts
await startRender(tdb, videoId);    // matérialise, lance l'exécution, rend la main
await collectRender(tdb, videoId);  // relève l'état, range le MP4 sur R2
```

**Deux temps, et ce n'est pas un raffinement.** Lambda rend en morceaux
parallèles pendant plusieurs minutes, et aucune requête HTTP ne doit attendre
ça. Les deux verbes sont idempotents : relancer `startRender` renvoie le job
existant plutôt que de démarrer une seconde exécution payante.

Un rendu échoué laisse la vidéo en `rendering`, jamais en `failed`. Les crédits
sont débités, les visuels existent, et une relance ne repaie rien.

**La règle non négociable de la composition** : le moteur *cherche* chaque
image, donc toute animation doit être un `fromTo` à des instants absolus. Un
`to` ou un temps accumulé produit une vidéo différente à chaque rendu.

Mesuré le 26 août 2026, pile déployée à Paris (`eu-west-3`) : une vidéo de
16,4 s montée en 34 s de bout en bout, base de données et R2 comprises, pour
0,0105 $. 492 images sur 52 machines en parallèle, sans discontinuité aux
jointures de segments. Un second essai sur 49 s de vidéo a rendu 1 475 images en
25 s pour 0,0157 $.

**Ce que la composition ne sait pas encore faire : les clips.** Le média est
posé en `background-image`, ce qui n'affiche qu'une image fixe. Un clip mp4
rendrait du vide sans lever d'erreur. Le moteur sait pourtant gérer la vidéo,
mais il lui faut une balise `<video>` portant son propre `data-start`. À écrire
avec l'étape des plans animés.

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

**18 tables** (`lib/db/schema.ts`), 9 migrations dans `lib/db/migrations/`.

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
| `payment_webhook_events` | journal des webhooks vérifiés, unique sur `event_id`, la garantie d'idempotence |
| `sound_assets` | catalogue de sons au niveau plateforme, sans `tenant_id` |
| `publications` | une publication d'une vidéo sur une chaîne |
| `youtube_quota_usage` | notre consommation du quota YouTube, pas les vues d'un client |

États d'une vidéo : `draft → validated → generating → rendering → rendered →
published`, plus `failed` (ajouté : sans lui, un crash de pipeline laisse une
vidéo bloquée en `generating`).

Colonnes ajoutées en route, chacune parce que le reste en dépendait :

- `videos.resolution`, dont le barème de crédits a besoin.
- `jobs.external_id` en index **unique**, pour qu'un webhook rejoué résolve
  exactement un job.
- `videos.output_url`, la clé R2 du MP4 final. Stockée plutôt que déduite d'une
  convention, car un rendu relancé produit une nouvelle exécution, et c'est
  celle qui a abouti qui doit être servie.
- `shots.source_image_url`, l'image fixe, distincte de `asset_url`, pour qu'une
  reprise du clip ne repaie pas l'image.
- `shots.voice_provider`, qui dit quelle voix a produit `audio_url`, pour que
  la passe de livraison sache quelles scènes elle a déjà refaites.

**Attention en équipe** : `lib/db/migrations/meta/_journal.json` casse dès que
deux branches génèrent une migration en parallèle. Deux personnes seulement en
génèrent.

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

`DATABASE_URL`, `TEST_DATABASE_URL`, `BASE_URL`, `AUTH_SECRET`,
`ENCRYPTION_KEY`, `R2_*`, `DEEPSEEK_API_KEY`, `CLOUDFLARE_AI_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `ELEVENLABS_API_KEY`, `POLLY_*` et `EDGE_TTS_*` (tous
optionnels, valeurs par défaut documentées), `REPLICATE_API_TOKEN`,
`REPLICATE_WEBHOOK_SECRET`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`,
`N8N_WEBHOOK_SECRET`, `N8N_BASE_URL`.

### Le rendu sur AWS

```
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
AWS_REGION=eu-west-3
HYPERFRAMES_RENDER_BUCKET
HYPERFRAMES_STATE_MACHINE_ARN
HYPERFRAMES_LAMBDA_MEMORY_MB / HYPERFRAMES_MAX_PARALLEL_CHUNKS
```

Les deux coordonnées de pile sont des **sorties du déploiement** : le serveur les
lit ici, pas dans l'état local de la CLI, qu'une instance serverless n'aura
jamais. Mise en place dans `render/aws/README.md`.

Amazon Polly réutilise ces mêmes clés AWS. Il a fallu y ajouter
`polly:SynthesizeSpeech`, que la politique du rendu ne contenait pas.

Un piège qui a coûté des heures : **les quotas AWS sont par région.** Une
augmentation accordée en `eu-west-3` ne se voit pas depuis `us-east-1`, et tout
paraît plafonné sans raison.

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

## Où en est le produit

**La chaîne fait six étapes, quatre fonctionnent, et une vidéo complète en
images fixes sort aujourd'hui.**

| Étape | État |
|---|---|
| Storyboard écrit par DeepSeek, éditable | ✅ |
| Voix off en deux passes, timings mot à mot | ✅ |
| Images Flux | ✅ |
| Montage sur AWS Lambda | ✅ |
| Plans animés (Wan sur Replicate) | ❌ |
| Publication YouTube | ❌ |

Solide autour : comptes et cloisonnement, projets et vidéos, crédits à deux
poches avec grand livre et idempotence, paiement GeniusPay et son webhook, essai
gratuit et filigrane, stockage R2.

### Ce qui manque, et qui l'attend

- **Les plans animés.** La dernière brique pour qu'une vidéo animée sorte. Les
  modèles sont choisis, le code reste à écrire, et la composition doit apprendre
  à afficher un clip. Voir `docs/plans-animes.md` et `docs/providers.md`.
- **L'orchestration n8n.** Chaque étape est aujourd'hui un appel manuel. Rien ne
  les enchaîne, donc un client ne peut pas encore aller du début à la fin seul.
- **Le journal des événements réels.** `activity_logs` ne contient que des
  connexions. Sans lui, l'administration n'a rien à afficher et la sécurité rien
  à auditer. Deux chantiers sont bloqués derrière.
- **L'administration.** Aucune route, aucun écran : le dépôt ne contient que
  `app/(dashboard)`. Nombre de vidéos, erreurs, quotas consommés par tenant.
- **La publication et ses statistiques.** Ni route OAuth, ni envoi, ni table de
  statistiques de vidéo. Les statistiques YouTube ne viennent pas de l'API qui
  envoie, c'en est une autre.
- **Les notifications**, et le canal reste un choix produit.
- **La musique et le catalogue de sons.** Le moteur sait poser une piste, mais
  aucun morceau ne peut encore être choisi et `sound_assets` est vide.
- **Le coût réel par job**, enregistré au moment de la génération, pour que la
  vue de consommation ne dépende d'aucune API de fournisseur.
- **Les deux agents** : celui qui accueille et retient le style d'écriture,
  celui qui lit les performances et propose des corrections.
- **Le support des clips dans la composition** (balise `<video>`), voir la
  section Montage.
- **Résiliation et rétrogradation en autonomie.** `subscriptions.cancel_at`
  existe, aucune route ne l'écrit.

Sur le quota YouTube : depuis décembre 2025 un envoi coûte environ **100
unités** au lieu de 1 600, et depuis juin 2026 les envois disposent de leur
**propre quota**, d'à peu près 100 appels par jour. Cela fait autour de 100
publications quotidiennes pour la plateforme. La limite reste globale et non
par tenant, mais elle n'est plus un préalable à demander.

---

## Qui fait quoi

La répartition a été arrêtée le 26 août 2026. Chacun a sa fiche, écrite pour
être lue seule le premier jour.

| Qui | Sa voie | Sa fiche |
|---|---|---|
| Ezechiel TADAGBE | Orchestration n8n, publication YouTube, les deux agents | `docs/ezechiel.md` |
| Prince KOUCHEME | Toute la logique directe : journal, API d'admin, quotas, statistiques, tooling, chemin de l'argent | `docs/prince.md` |
| Ahmad OUOROU | Les écrans du parcours client | `docs/ahmad.md` |
| Rosaire KAKPO | Les écrans compte et administration, plus le son | `docs/rosaire.md` |
| Merveille GANDJI | Cloisonnement des comptes, identités, quotas AWS et Replicate | `docs/merveille.md` |
| Cosme MISSIKPODE | Sécurité logicielle, secrets, isolation, plus les plans animés | `docs/cosme.md` |

`docs/passation.md` est le briefing général, et sa section 6 liste les pièges
découverts. C'est la plus utile du document.

Autres documents : `docs/providers.md` (le choix des modèles de génération et
ce qu'il implique), `docs/tarifs.md` (le chiffrage complet, coûts fournisseurs
compris), `docs/contrats.md` (jobs, n8n vers Next.js, nommage R2, publication),
`docs/produit-et-wireframes.md` et `docs/brief-ui.md` (les écrans et la palette).
