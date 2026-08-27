# Merveille — le compte AWS : identités et quotas

Ton périmètre est la console AWS et le dossier `render/aws/`. Tu n'as pas besoin
de Cosme pour avancer, et lui n'a pas besoin de toi — voir la dernière section
pour la seule surface que vous partagez.

Trois choses, **dans cet ordre**. Les deux premières attendent depuis le
26 août 2026.

## 1. Faire tourner les clés AWS

Elles ont circulé **en clair** pendant la mise en place du rendu Lambda. Elles
donnent accès à CloudFormation, IAM, Lambda, S3, Step Functions et Polly sur le
compte `902665993337`.

IAM → Utilisateur `remotion-renderer-policy` → Informations d'identification de
sécurité → créer une nouvelle clé, la mettre dans `.env`, **puis** désactiver
l'ancienne. Dans cet ordre : l'inverse arrête le rendu et la voix off.

Vérifie après coup que les deux tiennent encore :

```bash
aws lambda get-function --function-name hyperframes-render --region eu-west-3
npx tsx lib/db/status.ts   # rien à voir avec AWS, mais confirme que .env est lisible
```

## 2. Envoyer la demande de quota mémoire Lambda

Le message est déjà écrit, mot pour mot, dans
`render/aws/demande-quota-lambda.md`. Le compte est plafonné à 3 008 Mo par
fonction ; il en faut 10 240 en `eu-west-3`.

Pourquoi : chez Lambda le CPU est proportionnel à la mémoire. À 3 008 Mo la
fonction reçoit moins d'un tiers du CPU disponible à 10 240, et le rendu 1080p
dépasse la limite de 15 minutes par invocation sur les segments chargés.

Quand le quota tombe : retirer le correctif local du template SAM — il ajoute
`3008` à une liste blanche qui ne le contenait pas — et redéployer à 10240.
**Ce correctif vit dans un clone hors dépôt et disparaît à un reclone.**

## 3. IAM au moindre privilège

`render/aws/iam-user-policy.json` est en `Resource: "*"`. Ça marche, ce n'est pas
défendable. Deux blocs : `RenderStackDeploy` et `VoiceSynthesis`.

Deux corrections y sont déjà faites, **ne les perds pas en régénérant** :

- `s3:PutBucketPublicAccessBlock` — l'action que l'outil génère,
  `s3:PutPublicAccessBlock`, **n'existe pas**. La console la refuse.
- `s3:GetBucketPublicAccessBlock` — CloudFormation relit la configuration au
  rollback.

Le second fichier, `iam-role-policy.json`, décrit le rôle que la pile crée
elle-même. Il est là pour audit : rien à créer à la main.

## 4. Le compte Replicate, et son piège silencieux

Replicate réduit **progressivement** le débit à mesure que le crédit s'épuise,
pour éviter le découvert. Sans moyen de paiement enregistré, la limite tombe à
une requête par seconde.

Ce n'est signalé nulle part. Aucune erreur, aucun message : les générations
ralentissent, les clients attendent, et les journaux n'expliquent rien. Cosme
verra son étape traîner et cherchera dans son code.

À faire : rechargement automatique activé, solde maintenu au-dessus de 20 $.
Départ conseillé à 100 $ avec rechargement déclenché à 30 $.

## 5. Le son, parce qu'il touche R2 plus que le code

Deux choses, et la première est une opération ponctuelle plus qu'un
développement.

**Le catalogue d'effets sonores.** Environ 150 sons générés une seule fois avec
ElevenLabs Sound Effects, entre 5 et 15 $ en tout, puis servis depuis R2 à coût
nul. Soixante effets (whoosh, impacts, montées, clics, notifications, glitchs,
page tournée), cinquante ambiances (rue, marché, bureau, forêt, pluie, océan,
vent, foule, cuisine, nuit) et quarante nappes musicales (tension, résolution,
curiosité, joie, mélancolie, épique, suspense, légèreté).

La table `sound_assets` et l'import existent déjà :

```bash
pnpm tsx lib/sounds/import-catalog.ts <catalogue>
```

Importer les lignes rend les sons **choisissables** par le LLM ; les fichiers
doivent atteindre R2 sous les mêmes clés pour être **jouables**. Les deux moitiés
comptent.

**La musique de fond.** ElevenLabs Music, environ 0,40 $ la minute générée,
licence commerciale incluse. La clé ElevenLabs existe déjà, donc aucun compte
nouveau. Lyria 3 de Google est cinq fois moins cher et sera à reconsidérer quand
le volume le justifiera ; Suno et Udio sont écartés faute d'API officielle.

Détails et raisons dans `docs/providers.md`.

## Les deux pièges qui ont coûté des heures

**Les quotas AWS sont par région.** L'augmentation de concurrence à 1 000 avait
été accordée en `eu-west-3` pendant que le déploiement visait `us-east-1`, pris
du défaut de la CLI. Tout paraissait plafonné sans raison. Vérifie la région
avant de conclure quoi que ce soit sur un quota.

**La concurrence réservée n'est pas un droit d'usage.** C'est une part prélevée
sur le pool du compte et **interdite** aux autres fonctions. AWS impose d'en
laisser 100 non réservés : avec un quota de 1 000, on peut en réserver 900.

## L'état de la pile aujourd'hui

Région `eu-west-3`, pile `hyperframes-default`, fonction `hyperframes-render` à
3 008 Mo. Bucket et machine à états sont dans `.env`
(`HYPERFRAMES_RENDER_BUCKET`, `HYPERFRAMES_STATE_MACHINE_ARN`) — le serveur lit
là, pas dans l'état local de la CLI.

Mesuré le 26 août 2026 : 492 images, 52 invocations, 12,7 s, 0,0105 $.

## La seule chose que tu partages avec Cosme

`.env`. Ta rotation y écrit une nouvelle clé AWS ; son chantier est de sortir ces
secrets d'un fichier. L'ordre est : **tu tournes d'abord, il migre ensuite** — un
magasin de secrets qu'on remplit avec une clé compromise ne sert à rien.

Préviens-le quand c'est fait. C'est le seul point de rendez-vous.

À lire d'abord : `render/aws/README.md`, puis `docs/passation.md` section 6.
