# Yannick — catalogue, lectures et écrans internes

Tu possèdes le **catalogue de sons**, les **statistiques** et le **back-office
en lecture**. Toutes tes tâches sont bornées : elles ont une réponse claire, et
un bug s'y **voit** immédiatement.

Ton code est relu par Mourchid. Écris **le test avant le code** — le projet a
236 tests, c'est la norme ici, pas une faveur qu'on te demande.

Stack : Next.js 15, Drizzle ORM, PostgreSQL, Vitest.
Tests : base `postgres_test` séparée, `fileParallelism: false`,
clients externes toujours injectables (jamais d'appel réseau dans un test).

---

## Zones interdites

`lib/credits/` · `lib/billing/` · `lib/payments/` · `lib/db/tenant-db.ts`

Ce n'est pas une question de niveau. C'est que ces quatre modules ont des
**pannes invisibles** : un bug dans le grand livre de crédits double-crédite un
client sans que rien ne casse à l'écran, et un bug dans `tenantDb()` montre les
vidéos d'un client à un autre. Aucun des deux ne se voit en relisant un diff,
et les deux coûtent de l'argent ou la confiance d'un client.

Si une de tes tâches semble avoir besoin d'y toucher, **demande** — c'est
probablement qu'il manque une fonction ailleurs.

---

## La règle qui protège tout le reste

Toute lecture en base passe par **`tenantDb()`**, jamais par `db` directement.

```ts
const tdb = await tenantDb();          // ✅ scopé au tenant connecté
const rows = await tdb.select()…       // il ne peut pas voir un autre client

import { db } from '@/lib/db/drizzle'; // ❌ non scopé — jamais dans ton code
```

Un test d'isolation existe déjà et vérifie que **toute** table scopée est
enregistrée. Si tu ajoutes une table, il te le dira.

Exception unique : `sound_assets` — le catalogue de sons est partagé par tous
les clients, il n'a pas de `tenant_id`. C'est volontaire et documenté.

---

## 1. Corpus de fixtures — ta première tâche

**Elle débloque Prince.** Sans elle, il attend le back pendant deux semaines.

Il te faut un jeu de données réaliste, insérable en une commande :

- un tenant, un projet, une vidéo
- 5 à 6 plans (`shots`) avec, pour chacun :
  - une `narration` (le texte parlé) et un `prompt` (la description visuelle)
  - `duration_s` **cohérente avec la longueur du texte** (~14 caractères par
    seconde : 69 caractères ≈ 5,28 s)
  - `duration_source: 'measured'` — c'est ce qui débloque l'écran de validation
  - `words` : les timings **mot à mot**, un objet par mot avec son début et sa
    fin en secondes. Prince en a besoin pour les sous-titres karaoké.
  - `audio_url` et `asset_url` : des URLs bidon mais bien formées
- des variantes utiles : une vidéo en `draft`, une en cours de production, une
  échouée, une publiée. Prince doit pouvoir afficher chaque état.

Regarde `lib/db/seed.ts` : il existe déjà, tu l'étends.

**Fini quand :** Prince lance une commande, ouvre l'éditeur de storyboard, et
voit une vidéo complète avec ses timings.

---

## 2. Catalogue de sons

51 sons existent sous forme de tableau Markdown. Le parseur est déjà écrit :
`lib/sounds/import-catalog.ts` expose `parseCatalogue()`.

- [ ] Écrire la commande d'import qui remplit la table `sound_assets`.
      La clé est **unique** — un import relancé doit mettre à jour, pas
      dupliquer.
- [ ] **Monter les fichiers audio sur R2.** Attends l'adaptateur de Mourchid,
      puis utilise `AssetStore.put()` — n'écris jamais de client S3 toi-même.
- [ ] CRUD d'administration du catalogue : lister, ajouter, corriger, retirer.
      Écran interne, réservé aux administrateurs de la plateforme.

Le champ `impacts` porte les secondes où le son **frappe** (`[0.14, 0.86,
1.51]`), pour caler un effet sur une coupe. Ne le laisse pas vide à l'import
s'il est renseigné dans le catalogue.

---

## 3. Statistiques

**Que des `SELECT`.** Aucune écriture, aucune logique d'argent. C'est pour ça
que c'est ta tâche : `tenantDb()` fait déjà l'isolation, et son test la
garantit.

À produire par tenant :

- [ ] Vidéos créées, en cours, publiées, échouées
- [ ] Crédits consommés sur la période, et solde restant
      (lis les colonnes existantes `credits_consumed` et le grand livre —
      **ne recalcule jamais un solde toi-même**, une fonction existe)
- [ ] Durée totale de vidéo produite
- [ ] Évolution dans le temps, pour un graphique

Attention aux performances : `credit_ledger` est indexé sur
`(tenant_id, created_at)`. Une requête qui n'utilise pas cet index deviendra
lente en production.

---

## 4. Back-office en lecture seule

Écrans internes, pour vous, pas pour les clients :

- [ ] Liste des tenants avec leur plan et leur solde
- [ ] Vidéos récentes, toutes plateformes confondues, avec leur état
- [ ] Jobs en échec — c'est l'écran que vous ouvrirez tous les matins
- [ ] Suivi du plafond GeniusPay : **500 000 FCFA par mois** pour toute la
      plateforme. Un compteur qui approche le plafond doit se voir.

**En lecture seule** au sens strict : aucun bouton qui modifie quoi que ce
soit. Les actions viendront plus tard, une fois les écrans stabilisés.

---

## 5. Journal d'activité

La table `activity_logs` et l'enum `ActivityType` existent, mais seuls les
événements de compte sont journalisés (connexion, invitation, changement de
mot de passe).

- [ ] Ajouter les événements produit : vidéo créée, storyboard généré,
      voix off enregistrée, vidéo validée, vidéo publiée.

Regarde comment les événements existants sont écrits et suis le même motif.

---

## Ce qui n'est plus dans ton périmètre

Les **notifications** (email, WhatsApp) sont retirées : elles seront gérées
par n8n, en dehors de l'application.

---

## Si tu bloques

Dis-le tôt. Une question posée le matin coûte dix minutes à Mourchid ; deux
jours de code parti dans la mauvaise direction coûtent deux jours à toi et une
relecture pénible à lui.
