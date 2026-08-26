# Rendu sur AWS Lambda — mise en place

Le montage tourne sur Lambda, pas sur nos machines. Un Chrome et un FFmpeg qui
travaillent trente secondes par vidéo ne justifient pas un serveur payé à
l'année, et la vidéo se découpe en morceaux rendus en parallèle.

## L'état actuel : le compte n'a pas les droits

L'utilisateur IAM configuré est `remotion-renderer-policy` — un reste de
l'époque Remotion. Sa politique est taillée pour Remotion, dont les ressources
ne portent pas les mêmes noms. Vérifié le 26 août 2026 :

| Permission | État |
|---|---|
| `lambda:ListFunctions` | ✅ |
| `s3:ListAllMyBuckets` | ✅ |
| `cloudformation:ListStacks` | ❌ refusé |
| `logs:DescribeLogGroups` | ❌ refusé |
| `iam:GetRole` | ❌ refusé |

`hyperframes lambda deploy` crée une **pile CloudFormation** qui construit le
rôle, la fonction, le bucket de sites et le groupe de logs. Sans
CloudFormation, IAM et Logs, le déploiement s'arrête à la première étape.

## Ce qu'il faut faire, une fois

Dans la console AWS, sur le compte `902665993337` :

1. **IAM → Politiques → Créer une politique → onglet JSON.** Coller le contenu
   de [`iam-user-policy.json`](iam-user-policy.json). L'appeler
   `hyperframes-deployer`.

   > La politique générée par `hyperframes lambda policies user` contient une
   > action qui n'existe pas — `s3:PutPublicAccessBlock`, au lieu de
   > `s3:PutBucketPublicAccessBlock`. La console la refuse. Le fichier
   > versionné ici est corrigé ; ne pas le régénérer sans refaire la
   > correction. `s3:GetBucketPublicAccessBlock` a été ajouté au passage :
   > CloudFormation relit la configuration au rollback.
2. **IAM → Utilisateurs → `remotion-renderer-policy` → Ajouter des
   permissions.** Y attacher `hyperframes-deployer`.
3. Vérifier :

   ```bash
   aws cloudformation list-stacks --max-items 1
   ```

   Doit répondre au lieu de refuser.

Le second fichier, [`iam-role-policy.json`](iam-role-policy.json), décrit le
rôle que la pile crée **elle-même**. Il est là pour audit : rien à créer à la
main.

## La voix : une permission de plus

Polly tourne sur le même compte et la même paire de clés que le rendu. La
politique versionnée ici porte donc un second bloc, `VoiceSynthesis` —
`polly:SynthesizeSpeech`, et `polly:DescribeVoices` pour pouvoir vérifier
quelles voix existent en neural dans la région sans deviner.

Vérifié le 26 août 2026 : sans ce bloc, l'appel est refusé net —

```
User: arn:aws:iam::902665993337:user/remotion-renderer-policy is not authorized
to perform: polly:SynthesizeSpeech because no identity-based policy allows the
polly:SynthesizeSpeech action
```

Si la politique `hyperframes-deployer` est déjà attachée, il faut la **remplacer**
par la version à jour de [`iam-user-policy.json`](iam-user-policy.json) : IAM →
Politiques → `hyperframes-deployer` → Modifier → JSON.

## Ensuite

```bash
npx hyperframes lambda deploy            # crée la pile, une fois
npx hyperframes lambda sites create <dossier-de-composition>
npx hyperframes lambda render <site-id>
npx hyperframes lambda progress <render-id>
```

La concurrence disponible sur ce compte est de **1000**. Le défaut de
`deploy` est 8 : à monter quand plusieurs clients rendent en même temps, pas
avant — de la concurrence réservée est de la concurrence retirée au reste du
compte.

## Sur les identifiants

Les clés vivent dans `.env`, qui n'est pas versionné. Elles ont circulé en
clair pendant la mise en place : **à faire tourner** (IAM → Utilisateur →
Informations d'identification de sécurité → créer une nouvelle clé, puis
désactiver l'ancienne) avant toute mise en production.
