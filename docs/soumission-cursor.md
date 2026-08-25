# Soumission Hackathon Cursor × Devs Days

Finale les **9 et 10 septembre 2026**. Démonstration en direct obligatoire.

Rien ici sur l'équipe : ces champs dépendent de qui participe. Ce fichier ne
couvre que les questions de fond.

**La ligne qui porte tout le dossier :**

> Les autres vous donnent des morceaux. GenTube vous donne la vidéo finie.

Deux concurrents directs existent en Afrique de l'Ouest (`docs/concurrence.md`).
ViralClip découpe une vidéo que vous avez déjà tournée. Deepnia vend des pièces
détachées — une image, une voix, un plan — et vous laisse les assembler. Le
montage, c'est là que le temps part, et personne ne le fait à votre place.

---

## « Pourquoi devrait-on vous sélectionner ? »

> Version prête à coller.

**Vous tapez un sujet. Vous recevez une vidéo prête à publier.**

Une école qui veut expliquer une leçon, une radio qui veut passer au format
vidéo, un commerçant qui veut vendre sur TikTok : tous ont quelque chose à
dire et aucun n'a de studio. Aujourd'hui il leur faut un scénariste, un
narrateur, un monteur — ou deux jours de leur propre temps, pour une vidéo
d'une minute.

GenTube écrit le texte parlé, l'enregistre en voix française, découpe le récit
en scènes, produit chaque image et chaque plan animé, allume les sous-titres
mot par mot, cale la musique et les bruitages sur les coupes, monte le tout et
l'envoie sur la chaîne YouTube du client.

Avant de payer, on relit chaque phrase, on réécrit, on réordonne les scènes,
on change une voix ou une transition. Ce qu'on valide est ce qu'on reçoit.

**Une minute de vidéo : quelques minutes d'attente, 400 FCFA.** Payables par
mobile money, sans carte bancaire. Le prix s'affiche avant de lancer la
production, et c'est le prix débité — parce que la voix est enregistrée en
premier, donc la durée est mesurée au lieu d'être devinée.

Ce n'est pas une maquette. On peut déjà créer un compte, écrire un sujet,
obtenir un storyboard, écouter la voix française, voir les images sortir et
lire le prix exact de la vidéo. Ce qu'il reste — les plans animés, le montage,
la mise en ligne — est spécifié et chiffré, et c'est exactement ce que la
semaine de build sert à finir.

**Ce que nous assumons :** aucune vidéo complète ne sort encore. Nous préférons
le dire maintenant plutôt qu'au moment de la démonstration.

---

## « En quoi pensez-vous que Cursor serait utile pour votre projet ? »

> Version prête à coller.

En une semaine, nous devons passer de « la vidéo est écrite, racontée et
illustrée » à « la vidéo est montée et en ligne ». Trois briques, toutes déjà
spécifiées : animer les images, assembler le film, le publier sur YouTube.

C'est précisément le travail où un éditeur agentique va vite : la décision est
prise, il reste l'exécution. Nous savons quelles colonnes chaque étape lit, ce
qu'elle écrit, ce qui se passe quand un fournisseur tombe. Ce qu'il manque,
c'est le temps de le taper.

Trois usages concrets pendant le build :

1. **Brancher les fournisseurs restants** contre des contrats déjà rédigés,
   plutôt que de les redécouvrir chacun à la main.
2. **Faire monter en vitesse ceux qui n'ont pas écrit le socle.** Le projet
   impose des règles qui ne pardonnent pas : les fichiers d'un client ne
   doivent jamais être lisibles par un autre, on ne facture jamais une durée
   devinée, on ne dépense jamais chez un fournisseur avant d'avoir débité. Un
   éditeur qui lit le fichier avant d'écrire fait respecter ces règles sans
   attendre la relecture.
3. **Écrire les tests des nouvelles étapes au niveau des anciennes.** Nous en
   avons 298. C'est ce qui fait qu'une démonstration en direct ne s'effondre
   pas.

Ce que nous n'attendons pas de Cursor : qu'il tranche à notre place. Le prix
d'une minute, l'expiration des crédits, le filigrane sur l'essai gratuit — ce
sont des arbitrages commerciaux, pas du code.

---

## « Dites-nous ce que vous attendez du hackathon »

> Version prête à coller.

**Une date qui nous force à finir.** Le socle est solide, et c'est le piège :
on peut consolider sans fin. Une démonstration en direct obligatoire oblige à
faire sortir une vraie vidéo, ce qui est le seul jalon qui compte.

**Un regard qui n'a pas participé à nos décisions.** Nous avons fixé nos prix
et notre essai gratuit en nous comparant à deux concurrents. Un jury verra ce
que nous ne voyons plus.

**Du mentorat sur ce que nous maîtrisons le moins :** assembler la vidéo sur
des machines éphémères, à un coût prévisible.

---

## « Liens vers les ressources »

Aucun n'est prêt. À rassembler avant d'envoyer.

- [ ] **Vidéo de présentation, 2 à 5 minutes.** Obligatoire.
- [ ] **Démonstration.** Montrer ce qui marche : créer un projet, écrire un
      sujet, obtenir le storyboard, écouter la voix, voir les images, lire le
      prix exact qui apparaît une fois les durées mesurées.
- [ ] **Dépôt GitHub** — `github.com/octavebahoun/gentube`. Vérifier s'il doit
      être public ; sinon préparer un accès en lecture pour le jury.
- [ ] **Maquettes** — 13 wireframes dans `docs/wireframes/`, dont 7 périmés
      (`docs/wireframes-a-corriger.md`). À corriger avant de les montrer.
- [ ] **Documents** — `docs/tarifs.md` et `docs/concurrence.md` se présentent
      tels quels. Le second est le plus convaincant : il montre qu'on connaît
      le marché.

---

## Notes de rédaction

Pourquoi ces choix, pour pouvoir les défendre à l'oral :

- **On ouvre sur le client, pas sur le code.** Un jury retient un problème et
  une transformation. « 298 tests » ne se retient pas ; « vous tapez un sujet,
  vous recevez une vidéo » se retient. Les chiffres techniques viennent après,
  comme preuve, jamais comme accroche.
- **Le différenciateur est le montage, pas le prix exact.** Deepnia affiche
  déjà « le coût exact avant chaque création ». Ce qui reste à nous : chez lui
  le prix porte sur une pièce détachée, chez nous sur la vidéo entière, montée.
- **Un seul chiffre est mis en avant : 400 FCFA la minute.** Trois chiffres
  s'annulent, un seul reste.
- **L'aveu est volontaire et placé à la fin.** Un jury pardonne un périmètre
  honnête, jamais une démonstration qui s'écroule.

### Autres accroches possibles

- **A.** « Vous tapez un sujet. Vous recevez une vidéo prête à publier. » —
  la transformation, en deux gestes. C'est celle retenue.
- **B.** « Les autres vous donnent des morceaux. GenTube vous donne la vidéo
  finie. » — plus forte devant un jury qui connaît le marché local, plus
  faible devant un jury qui ne connaît pas les concurrents.
- **C.** « Une vidéo par jour, sans studio, sans monteur, sans carte
  bancaire. » — la meilleure pour un public d'entrepreneurs ; « sans carte
  bancaire » parle immédiatement ici.
