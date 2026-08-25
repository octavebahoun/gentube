# Mourchid — infra et publication

Tu possèdes le **socle technique** : le stockage, la file de jobs, le rendu et
la publication YouTube. Tu deviens **propriétaire du schéma** après la migration consolidée, et tu es
**relecteur du code de Yannick**.

Stack : Next.js 15 (App Router), Drizzle ORM, PostgreSQL, Vitest.
Base de dev : Docker local. Tests : base `postgres_test` séparée,
`fileParallelism: false`.

---

> **Ce qui t'est retiré :** l'adaptateur R2 et le plan de nommage R2 sont
> repris par le lead, parce qu'ils bloquent trois personnes. Tu récupères un
> `AssetStore` fonctionnel — utilise `put()` et `signedUrl()`, n'écris jamais
> de client S3 toi-même.
>
> Tu récupères aussi **la propriété du schéma** une fois la migration
> consolidée passée.

---

## 1. File de jobs — `lib/jobs/`

La table `jobs` existe déjà : `step`, `external_id` (**unique**, pour qu'un
webhook rejoué résolve exactement un job), `status`, `payload`, `attempts`.

À définir, et c'est un contrat que les 4 devs suivront :

- Le **vocabulaire exact de `step`** (`voiceover`, `image`, `clip`,
  `render`, `publish` — à figer).
- La **politique de reprise** : combien de tentatives, quel délai.
- Et surtout : **où vit la vérité** de « où en est cette vidéo » ?
  Dans `videos.status` ou dans les lignes `jobs` ? Si les deux, elles
  divergeront et personne ne saura laquelle croire.

---

## 2. Rendu Hyperframes sur Lambda

On a quitté Remotion (licence payante au-delà de 3 personnes) pour
**Hyperframes** de HeyGen (Apache 2.0, HTML → MP4).

`@hyperframes/aws-lambda` fournit déjà `hyperframes lambda deploy`,
`lambda render`, `lambda progress`. Donc c'est surtout de la configuration.

Le moteur est **Chrome headless + FFmpeg** : Node 22 requis.

**Une question d'intégration à trancher :** le rendu Lambda écrit
naturellement vers S3, nous stockons sur R2. R2 est compatible S3, donc c'est
peut-être direct — sinon c'est une copie après rendu. À décider, pas à
improviser.

**Épingle les versions `@hyperframes/*` à l'exact.** 0.8.x, 371 versions
publiées, plusieurs par jour. Un `^` sur du 0.x = des ruptures en silence.

---

## 3. Webhooks providers

Replicate et Lambda rappellent quand un job finit. Le motif à suivre existe
déjà, écrit et testé : `lib/billing/webhook.ts`.

Reprends-en l'ordre, il n'est pas arbitraire :
parse → fraîcheur du timestamp → **signature (401, rien n'est écrit)** →
journalisation → résolution du tenant **depuis notre base**, jamais depuis les
metadata du provider → re-vérification côté provider → écriture en une seule
transaction avec une clé d'idempotence.

---

## 4. YouTube

- OAuth : flux d'autorisation, stockage des tokens.
  `lib/crypto/encryption.ts` (AES-256-GCM) existe déjà, la table
  `youtube_tokens` aussi. **Ne logge jamais ces colonnes, ne les expose
  jamais via une route API.**
- Rafraîchissement automatique des tokens expirés.
- Upload résumable du MP4 final.
- **Compteur de quota** : 10 000 unités/jour pour **toute la plateforme**,
  soit environ **6 uploads par jour**, tous tenants confondus. Aucune table
  n'existe pour ça. C'est une contrainte produit dure, pas un détail.
- Programmation des publications : aujourd'hui il n'y a que
  `videos.youtube_video_id` et `videos.published_at`.

---

## 5. Deux poches de crédits

> Posé par le lead dans la migration consolidée. Tu en hérites : c'est du
> chemin monétaire, donc c'est toi qui le maintiens ensuite.

Décision actée : **les crédits de plan expirent à la fin du cycle**, ils ne
s'accumulent pas.

Et la contrepartie, non négociable : **les crédits achetés en recharge
n'expirent jamais.** Faire expirer ce qu'un client a payé, c'est du vol.

Or `credit_ledger` ne connaît qu'un seul solde.

Il faut donc séparer les deux poches. **Ordre de débit acté : celle qui
expire d'abord** (les crédits du plan), sinon le client perd de la valeur
qu'il aurait pu utiliser.

Exemple : 500 crédits de plan qui meurent le 31, 300 achetés. Il consomme
200 → on prend sur les 500.

Le grand livre est sur le chemin monétaire : écritures en transaction, clé
d'idempotence, et un test par cas de bord.

---

## 6. Propriétaire du schéma

Quatre devs qui lancent `drizzle-kit` = conflit sur `_journal.json` à chaque
fois. Les autres te **demandent** leurs colonnes, tu produis la migration.

Idéalement : une migration consolidée maintenant pour ce qu'on sait déjà
(publications, quota YouTube), et on n'y retouche plus cette semaine.

---

## 7. CI

Le projet a 236 tests et personne ne les fait tourner automatiquement.
`pnpm test`, `pnpm typecheck`, `pnpm build` sur chaque PR.

C'est ce qui rendra la relecture de Yannick tenable : la machine attrape les
régressions, tu relis la logique.

---

## 8. Relecture du code de Yannick

Budgète **20 à 30 % de ton temps**. Si ce n'est pas budgété explicitement, ça
mange le planning en silence.

Ce que tu cherches en priorité — les erreurs qui **ne se voient pas** à
l'écran : une requête non scopée par tenant, une écriture qui devrait être
dans une transaction, un `any` qui masque un null.
