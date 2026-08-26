# Cosme — secrets et isolation multi-tenant

Ton périmètre est le dépôt : où vivent les secrets, et ce qui empêche un client
de lire les fichiers d'un autre. Tu n'as pas besoin de Merveille pour avancer, et
lui n'a pas besoin de toi — voir la dernière section pour la seule surface que
vous partagez.

## 1. Auditer l'isolation, parce que c'est le risque le plus grave

Une fuite entre tenants ne se répare pas : elle s'annonce.

Toute l'isolation tient en **deux fonctions**. Commence par elles, pas ailleurs :

- `assetKey()` dans `lib/storage/index.ts` — toute clé d'objet commence par
  l'identifiant du tenant. Elle rejette déjà `.` et `..` par nom, parce que
  `7/../8/secret.mp3` matche autrement le motif d'un segment valide.
- `tenantDb()` dans `lib/db/tenant-db.ts` — toute requête est filtrée sur le
  tenant, et un payload qui tenterait d'écrire un autre `tenant_id` est rejeté.

Ce que l'audit doit chercher : un accès au stockage qui n'est pas passé par
`assetKey`, et une requête sur `db` là où elle aurait dû passer par `tenantDb`.
Les deux se trouvent en cherchant les appels, pas en lisant les fonctions.

## 2. Le bucket R2 n'est jamais public

Tout se lit par une URL signée à durée de vie courte (`AssetStore.signedUrl`).
Il n'y a **volontairement** pas de `R2_PUBLIC_URL` dans la configuration, et il
ne faut pas en ajouter un.

Un bucket ouvert annulerait l'isolation d'un coup : deviner
`7/videos/42/voice/scene-1.mp3` suffirait à écouter la narration d'un client.

Ce qu'il te reste à vérifier : que le bucket est bien fermé côté Cloudflare (pas
seulement côté code), et que la durée de vie des URLs signées est courte partout
où on en émet.

## 3. Sortir les secrets de `.env`

Aujourd'hui tout y vit : R2, Cloudflare Workers AI, DeepSeek, ElevenLabs,
GeniusPay, AWS. C'est tenable à six personnes, pas au-delà. Le fichier n'est pas
versionné, mais il est copié à la main sur chaque machine — donc il circule.

`.env.example` est l'inventaire à jour : chaque variable y est documentée avec ce
qu'elle casse quand elle manque. Commence par le lire en entier, c'est le plus
court chemin pour connaître la surface.

Deux clés méritent une attention à part :

- `ENCRYPTION_KEY` protège les jetons OAuth YouTube au repos. La faire tourner
  rend **tous** les jetons indéchiffrables et force chaque tenant à reconnecter
  sa chaîne. Une rotation de celle-là est une opération, pas une routine.
- `GENIUS_ENV` décide si les paiements sont réels. Tout ce qui n'est pas
  exactement `live` est du bac à sable : passer en production est un acte
  explicite, jamais une faute de frappe. Une clé `live` posée sous un nom
  `GENIUS_SANDBOX_*` fait lever une erreur au lieu de débiter pour de vrai —
  garde cette propriété si tu déplaces la configuration.

## Un garde-fou déjà en place, à ne pas défaire

`lib/test/setup.ts` vide toutes les variables des fournisseurs payants avant
chaque test. Sans lui, un test qui oublie d'injecter un double appelle le vrai
service — c'est exactement ce qui est arrivé la première fois que l'adaptateur R2
a existé : deux objets écrits dans le bucket de production.

Même logique pour la base : `lib/test/database.ts` refuse de lancer la suite
contre un hôte autre que `localhost`, parce que chaque test tronque chaque table.

Si tu ajoutes un fournisseur, sa variable va dans ces deux listes.

## La seule chose que tu partages avec Merveille

`.env`. Sa rotation des clés AWS y écrit une nouvelle valeur ; ton chantier est
de sortir ces secrets du fichier. L'ordre est : **il tourne d'abord, tu migres
ensuite** — un magasin de secrets qu'on remplit avec une clé compromise ne sert
à rien.

Il te préviendra quand c'est fait. C'est le seul point de rendez-vous.

À lire d'abord : `.env.example` en entier, puis `docs/contrats.md` (le plan de
nommage des objets) et `docs/passation.md` section 6.
