# Merveille et Cosme — sécurité et infrastructure

Trois choses à faire, **dans cet ordre**. Les deux premières sont datées : elles
attendent depuis le 26 août 2026.

## 1. Faire tourner les clés AWS

Elles ont circulé **en clair** pendant la mise en place du rendu Lambda. Elles
donnent accès à CloudFormation, IAM, Lambda, S3, Step Functions et Polly sur le
compte `902665993337`.

IAM → Utilisateur `remotion-renderer-policy` → Informations d'identification de
sécurité → créer une nouvelle clé, mettre à jour `.env`, **puis désactiver
l'ancienne** — dans cet ordre, sinon le rendu s'arrête.

## 2. Envoyer la demande de quota mémoire Lambda

Le message est déjà écrit, mot pour mot, dans
`render/aws/demande-quota-lambda.md`. Le compte est plafonné à 3 008 Mo par
fonction ; il faut 10 240 en `eu-west-3`.

Pourquoi : chez Lambda le CPU est proportionnel à la mémoire. À 3 008 Mo la
fonction reçoit moins d'un tiers du CPU disponible à 10 240, et le rendu 1080p
dépasse la limite de 15 minutes par invocation sur les segments chargés.

Quand le quota tombe : retirer le correctif local du template SAM (il ajoute
3008 à une liste blanche qui ne le contenait pas) et redéployer à 10240. **Ce
correctif vit dans un clone hors dépôt et disparaît à un reclone.**

## 3. IAM au moindre privilège

La politique versionnée dans `render/aws/iam-user-policy.json` est en
`Resource: "*"`. Elle marche, elle n'est pas défendable. Elle porte deux blocs :
`RenderStackDeploy` et `VoiceSynthesis`.

Deux corrections y sont déjà faites, ne les perdez pas en régénérant :
`s3:PutBucketPublicAccessBlock` (l'action générée par l'outil,
`s3:PutPublicAccessBlock`, **n'existe pas** — la console la refuse), et
`s3:GetBucketPublicAccessBlock`, que CloudFormation relit au rollback.

## Ce qu'il ne faut casser sous aucun prétexte

**Le bucket R2 n'est jamais public.** Tout se lit par une URL signée à durée de
vie courte. Un bucket ouvert annulerait l'isolation multi-tenant : deviner
`7/videos/42/voice/scene-1.mp3` suffirait à écouter la narration d'un client.
Il n'y a volontairement pas de `R2_PUBLIC_URL` dans la configuration.

**Les deux goulots de l'isolation** sont `assetKey()` (`lib/storage/index.ts`) et
`tenantDb()` (`lib/db/tenant-db.ts`). Toute clé d'objet commence par
l'identifiant du tenant, toute requête est filtrée dessus. Un audit utile
commence là, pas ailleurs.

## Le piège qui a coûté des heures

**Les quotas AWS sont par région.** L'augmentation de concurrence à 1 000 avait
été accordée en `eu-west-3` alors que le déploiement visait `us-east-1`, pris du
défaut de la CLI. Tout paraissait plafonné sans raison. Vérifiez la région avant
de conclure quoi que ce soit sur un quota.

Second piège : la concurrence **réservée** d'une fonction n'est pas un droit
d'usage, c'est une part prélevée sur le pool du compte et interdite aux autres
fonctions. AWS impose d'en laisser 100 non réservés.

## Les secrets

Tout vit dans `.env`, non versionné. R2, Cloudflare Workers AI, DeepSeek,
ElevenLabs, GeniusPay, AWS. C'est tenable à six, pas au-delà : proposer un
magasin de secrets fait partie de votre chantier.

À lire d'abord : `render/aws/README.md`, puis `docs/passation.md` section 6.
