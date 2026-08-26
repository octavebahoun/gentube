# Demande de levée de quota — mémoire Lambda

Où l'envoyer : https://support.console.aws.amazon.com/support/home#/case/create

- Type de demande : **Augmentation des limites de service**
- Service : **Lambda**
- Limite : **Function memory** (mémoire par fonction)
- Région : **eu-west-3** (Paris)
- Nouvelle valeur demandée : **10240**

Compte concerné : `902665993337`.

---

## Message à coller

> Objet : Augmentation de la mémoire maximale par fonction Lambda à 10 240 Mo
>
> Bonjour,
>
> Notre compte est actuellement limité à 3 008 Mo de mémoire par fonction
> Lambda. Nous souhaitons porter cette limite à 10 240 Mo en eu-west-3.
>
> **Notre usage.** Nous exploitons une plateforme de génération vidéo. Le
> montage final est assemblé par une fonction Lambda unique, orchestrée par
> Step Functions, qui exécute trois rôles : planifier le rendu, rendre un
> segment d'images dans un Chrome headless, puis assembler les segments avec
> FFmpeg. Une vidéo est découpée en segments rendus en parallèle.
>
> **Pourquoi la mémoire.** Cette charge est limitée par le processeur, pas par
> la mémoire vive. Chez Lambda, la part de CPU allouée est proportionnelle à
> la mémoire configurée : à 2 048 Mo la fonction reçoit environ un cinquième
> du CPU disponible à 10 240 Mo. Le rendu d'une image par Chrome puis son
> encodage par FFmpeg s'en trouvent ralentis dans la même proportion, ce qui
> fait dépasser le délai maximal de 15 minutes par invocation sur les
> segments les plus chargés.
>
> Le fournisseur du moteur de rendu que nous utilisons recommande
> explicitement 10 240 Mo pour du 1080p.
>
> **Volume attendu.** Quelques dizaines de rendus par jour au démarrage, soit
> quelques centaines d'invocations quotidiennes. Notre quota d'exécutions
> simultanées est déjà de 1 000 dans cette région.
>
> Merci d'avance.

---

## Le correctif temporaire, à retirer après la levée

Le template SAM de HyperFrames n'autorise que des paliers de mémoire :
`[2048, 3072, 4096, …]`. **3008 n'y figure pas**, alors que c'est exactement
le plafond d'un compte neuf — donc sans correctif, la seule valeur déployable
sous le plafond est 2048.

Le clone local est patché pour accepter 3008 :

```
examples/aws-lambda/template.yaml
  AllowedValues: [2048, 3008, 3072, …]
```

**Ce patch est perdu si le dépôt est recloné.** À refaire, ou à retirer une
fois le quota levé — auquel cas on déploie directement à 10240 et la liste
d'origine suffit.

---

## Sur la concurrence réservée

`--concurrency` fixe la **concurrence réservée** de la fonction. Ce n'est pas
un droit d'usage : c'est une part prélevée sur le pool du compte et **interdite
à toutes les autres fonctions**.

Le défaut de la CLI est 8. C'est trop peu : le rendu demande 16 segments en
parallèle (`HYPERFRAMES_MAX_PARALLEL_CHUNKS`), donc la moitié attendrait.

AWS impose de laisser 100 non réservés. Avec un quota de 1 000, on peut donc
en réserver jusqu'à 900. On en prend **100** : de quoi lancer six rendus de
16 segments en même temps, en laissant 900 au reste du compte.
