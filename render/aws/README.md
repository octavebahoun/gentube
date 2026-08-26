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
