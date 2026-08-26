# Cosme — sécurité logicielle, secrets et isolation

Ton périmètre est le dépôt : ce qu'un client peut atteindre qui ne lui appartient
pas, ce que le code exécute sans l'avoir vérifié, et où vivent les secrets. Tu n'as pas besoin de Merveille pour avancer, et
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

## 3. La sécurité logicielle, y compris celle des agents

C'est la partie qui n'appartenait à personne, et c'est pour ça qu'elle est chez
toi : tu es déjà dans le code.

**Le chemin qui me gêne le plus.** Le thème écrit par un client part chez
DeepSeek, revient sous forme de storyboard, et ce texte devient du HTML que
Chrome exécute au rendu. Une seule protection existe aujourd'hui : `js()` dans
`lib/render/composition.ts` échappe `</` pour qu'un titre ne puisse pas fermer
la balise de script. C'est un point du chemin, pas le chemin.

Ce qu'il faut suivre de bout en bout : `videos.theme` → prompt DeepSeek →
`shots.prompt` et `shots.narration` → `composeHtml()` → Chrome. À chaque
frontière, demande ce qui est échappé et par qui.

**L'autorisation dans les server actions.** Presque tout l'app passe par
`validatedActionWithUser`. Ce motif garantit qu'un utilisateur est connecté — pas
qu'il a le droit. Le rôle (`owner`, `admin`, `member`) existe en base ; ce qu'il
faut vérifier, c'est qu'une action qui devrait être réservée à un `owner` le
vérifie vraiment, et pas seulement dans l'écran qui l'appelle.

**Les routes internes signées.** Ezechiel va écrire la surface que n8n appelle,
authentifiée par `N8N_WEBHOOK_SECRET`. C'est une frontière machine-à-machine :
elle mérite une revue par quelqu'un qui ne l'a pas écrite. Même chose pour le
webhook GeniusPay, déjà en place — un appel mal signé est répondu 401 et rien
n'est écrit ; vérifie que ça tient encore après chaque changement, parce que
c'est le seul rempart entre un faux paiement et un crédit accordé.

**Ce qu'un agent a le droit de faire.** Le pipeline appelle des modèles, et n8n
enchaîne des étapes sans qu'un humain valide entre chacune. La question à tenir
est simple à énoncer et facile à perdre de vue : **qu'est-ce que cette étape peut
faire de pire si le modèle renvoie n'importe quoi ?** Un storyboard absurde ne
coûte que des crédits. Une étape qui accepterait une clé d'objet venue du modèle,
ou un identifiant de tenant, serait autre chose.

C'est pour ça qu'`assetKey()` construit les clés au lieu de les recevoir. Toute
étape future doit garder cette propriété : le modèle décide du contenu, jamais
de la destination.

## 4. Sortir les secrets de `.env`

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
