# Audit de l'interface — 14 septembre 2026

Fait en session, dans Chrome, sur `localhost:3000`, connecté en
`owner@studio.test` sur la vraie base. Chaque constat est une chose vue à
l'écran ou lue dans la console, pas une déduction.

---

## Le verdict en une phrase

**Les écrans sont bien branchés sur la base. Ils ne sont pas branchés sur un
pipeline qui tourne.**

Les deux vidéos de la base sont en **Brouillon**. Aucune n'est jamais allée plus
loin. Ce n'est pas un problème d'interface — c'est la conséquence des trois clés
`.env` vides. Mais ça veut dire qu'**aucun écran d'aval n'a jamais été vu avec
de vraies données** : ni « En fabrication », ni « Terminée », ni « Publiée ».

---

## Ce qui est réellement connecté

| Écran | Preuve vue à l'écran |
|---|---|
| Connexion | Un mauvais mot de passe renvoie une vraie erreur de la base |
| Espace de travail | 840 crédits — le vrai solde du tenant |
| Projets | 2 projets réels, avec leurs badges `MIXTE` / `IMAGES FIXES` et leurs dates |
| Vidéos | 2 vidéos réelles ; les 8 filtres d'état passent par l'URL (`?etat=draft`…) |
| Fabrication | « 0 % · 3 postes sur 6 actifs », « En attente du storyboard » — état calculé, pas figé |
| Facturation | 120 de quota + 720 achetés = 840, cohérent avec l'en-tête |
| Activité | Ma connexion d'il y a 3 minutes y figure |
| Admin | Les jobs par vidéo, chargés en SWR |
| Éditeur de storyboard | Les 13 actions serveur sont toutes importées par les composants |

Le design system `gx` est adopté sur **tous les écrans sauf un** :
`projects/[id]/videos/new`, resté sur les anciens `components/ui`.

---

## Les sept défauts trouvés

### 1. Le bouton « ambiance claire » ne change rien — *sérieux*

`components/gx/gx-theme.tsx` pose `class="light"` sur `<html>` via `next-themes`.

Mais `app/globals.css` n'a **aucun bloc `.light`**. Une seule palette, en dur
sur `:root` (ligne 93), et `html { background: #050608 }` par-dessus.

**Ce qu'on voit** : l'icône passe du soleil à la lune, l'état est mémorisé — et
la page reste noire. Le bouton bascule un thème qui n'existe pas.

> Deux issues : supprimer le bouton, ou écrire la palette claire.

### 2. Ce même bouton casse l'hydratation sur toutes les pages — *sérieux*

C'est la **seule erreur console de tout le site** :

```
A tree hydrated but some attributes of the server rendered HTML
didn't match the client properties.
+ aria-label="Passer en ambiance sombre"
- aria-label="Passer en ambiance claire"
```

`gx-theme.tsx` protège déjà l'icône avec un garde `monte` — mais **pas
l'`aria-label` ni le `title`**, qui lisent `resolvedTheme` avant l'hydratation.

> Trois lignes à corriger : passer `aria-label` et `title` derrière le même
> garde `monte` que l'icône.

### 3. Les prix affichés ne sont pas ceux de la grille tarifaire — *sérieux*

| | Ce que l'écran affiche | Ce que dit `docs/tarifs.md` |
|---|---|---|
| Starter | 15 000 FCFA → **1 000 crédits** | 15 000 FCFA → **2 640 crédits** |
| Pro | **35 000 FCFA** → **2 600 crédits** | **30 000 FCFA** → **5 400 crédits** |

Source de l'écran : `lib/credits/pricing.ts:129-137`.

L'écart n'est pas cosmétique : **l'étude de marge à 40-41 %
(`docs/etude-des-couts.md`) est calculée sur les chiffres du doc**, pas sur ce
que le produit vend réellement. Le Pro est 5 000 FCFA plus cher et donne moitié
moins de crédits que la grille annoncée.

> À trancher : lequel des deux est juste. Puis aligner l'autre.

### 4. L'en-tête flottant n'a pas de fond — *visible partout*

Les pastilles de droite (thème, solde, avatar) sont en `sticky` sans plaque de
fond. Dès qu'on descend, le texte de la page passe **dessous** :

> « …Faire expirer ce qui a été acheté serait du (840) vol »

Vu sur Facturation et sur Mon compte. Une couleur de fond sur le `<header>` suffit.

### 5. Deux noms pour le même bouton

Dans l'éditeur de storyboard :

- Le bouton, en haut : **« Écrire le storyboard »**
- L'état vide, juste en dessous : *« Clique sur **"Générer le storyboard"** avec l'IA pour démarrer »*

Le client cherche un bouton qui n'existe pas sous ce nom.

### 6. De l'anglais résiduel dans une interface française

| Où | Ce qui s'affiche |
|---|---|
| Connexion | *Invalid email or password. Please try again.* |
| Éditeur | *AI Scene Generator* |
| Éditeur | *MONITOR STUDIO* |
| Éditeur | *STUDIO TIMELINE & TRACKS* · *3 Tracks Active* |
| Éditeur, Admin | badge *DRAFT* — alors que la liste des vidéos dit *BROUILLON* |

Le dernier est le pire : **le même état porte deux noms selon l'écran.**

### 7. « 3 Tracks Active » quand rien n'est actif

La timeline annonce *3 Tracks Active* alors que les trois pistes affichent
`0.0s` et que la vidéo n'a aucune scène. Le compteur compte les pistes
**existantes**, pas les pistes **remplies**.

---

## Deux détails mineurs

- Le bouton **« Nouvelle vidéo »** de la bibliothèque mène à `/dashboard/projects`,
  la liste des projets — pas à un formulaire. C'est défendable (il faut choisir
  un projet d'abord), mais le libellé ne le dit pas.
- La section **YouTube** de « Mon compte » dit deux fois la même chose :
  *« Publiez vos vidéos directement sur votre chaîne YouTube. »* puis
  *« Connectez votre chaîne YouTube pour publier vos vidéos directement. »*

---

## Non testé

- **Le rendu en largeur téléphone.** Le redimensionnement de fenêtre n'a pas
  changé le viewport rendu ; je ne peux rien affirmer.
- **Le déclenchement réel du storyboard.** Le bouton appelle DeepSeek, qui est
  facturé. Non lancé sans accord.

---

## Par où commencer

| Ordre | Quoi | Effort |
|---|---|---|
| 1 | Trancher la grille tarifaire (§3) | une décision, puis 2 lignes |
| 2 | Le garde `monte` sur `aria-label` et `title` (§2) | 3 lignes |
| 3 | Le fond du `<header>` (§4) | 1 ligne |
| 4 | Bouton d'ambiance : le retirer ou écrire la palette claire (§1) | 1 ligne, ou une journée |
| 5 | Uniformiser `DRAFT` / `BROUILLON` et traduire le reste (§5, §6) | une passe de relecture |
| 6 | Le compteur de pistes (§7) | 1 ligne |
