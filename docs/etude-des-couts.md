# Étude des coûts GenTube — dossier de travail

*5 septembre 2026. Destiné à cadrer les coûts avec des intervenants extérieurs.
Tous les tarifs ont été relevés le jour même sur les grilles publiques des
fournisseurs ; les valeurs tirées du code portent leur fichier source.*

---

## 0. Ce qu'il faut savoir avant de lire

**Le produit.** GenTube est une plateforme SaaS de génération vidéo. Le client
décrit ce qu'il veut, la plateforme écrit un storyboard, génère les images, les
anime en clips, produit une voix off, ajoute sous-titres et musique, et monte le
tout en une vidéo finale. Le montage est rendu sur AWS Lambda.

**Le marché.** Bénin, encaissement en FCFA (franc CFA ouest-africain, XOF) par
mobile money. Le code convertit à **625 FCFA pour 1 $**.

**Le modèle de vente.** Des abonnements mensuels donnant un quota de
**crédits**. Un crédit vaut, par définition interne, *une seconde d'image fixe
en 480p*. Les autres formats en consomment davantage.

| Plan | Prix mensuel | Crédits | Prix du crédit |
|---|---|---|---|
| Starter | 15 000 FCFA (24,00 $) | 2 640 | 5,68 FCFA — 0,00909 $ |
| Pro | 30 000 FCFA (48,00 $) | 5 400 | 5,56 FCFA — 0,00889 $ |
| Business | négocié par contrat | — | — |

**Combien de crédits consomme une seconde produite** (`lib/credits/pricing.ts`) :

| | 480p | 720p |
|---|---|---|
| Plan en image fixe | 1 | 3 |
| Plan animé | 2 | 6 |

---

## 1. La question posée

L'étude de coûts existante a été bâtie sur **un seul modèle vidéo**,
`wan-2.2-i2v-fast`, à 0,00988 $ la seconde. Deux choses la rendent caduque :

1. **Le marché des modèles s'étale sur un facteur 16.** Le même « plan animé
   480p » coûte 0,00988 $/s chez l'un et 0,16 $/s chez l'autre. La grille de
   crédits n'a pas d'axe « modèle » : elle ne sait pas exprimer cet écart.
2. **Onze postes de coût sur treize ne sont chiffrés nulle part.** Seuls la
   vidéo et l'image existent comme nombre dans le système.

Ce dossier fournit la matière pour trancher : les tarifs réels, un exemple
chiffré ligne par ligne, ce que nous ne savons pas encore, et les décisions
produit qui déplacent les coûts.

---

## 2. Les treize postes, et comment chacun se facture

Ils n'ont **pas la même unité naturelle**. Rien ne s'additionne tant que tout
n'est pas ramené au même objet — voir §4.

### 2.1 Variables à la vidéo produite

| Poste | Fournisseur | Tarif public | Unité facturée | Source |
|---|---|---|---|---|
| Modèle vidéo 480p | Replicate · `wan-2.2-i2v-fast` | **0,05 $** | par clip de 81 images (5,06 s) — *pas* à la seconde | grille Replicate |
| Modèle vidéo 720p | Replicate · `p-video` | **0,02 $** | par seconde | grille Replicate |
| Modèle image | Cloudflare · `flux-2-klein-4b` | **0,000287 $** | par tuile 512×512 en sortie | Workers AI |
| Voix off | AWS Polly, moteur *neural* | **16,00 $** | par million de caractères | grille Polly |
| Voix off (alt.) | ElevenLabs · `eleven_multilingual_v2` | **100,00 $** | par million de caractères | grille ElevenLabs |
| Voix off (alt.) | Edge TTS | **gratuit** | — | *non contractuel, voir §6* |
| Transcription | Cloudflare · `whisper-large-v3-turbo` | **0,0005 $** | par minute d'audio | Workers AI |
| Storyboard + prompts | DeepSeek · `deepseek-v4-flash` | **0,44 $ / 1,32 $** | par M de jetons entrée / sortie, heures pleines | grille DeepSeek |
| Rendu | AWS Lambda, eu-west-3 | **0,0000166667 $** | par Go-seconde, + 0,20 $ par million d'appels | grille Lambda |

> **Détail exploitable :** DeepSeek facture **moitié prix en heures creuses**
> (0,22 $ / 0,66 $). Ses heures pleines sont 01:00–04:00 et 06:00–10:00 UTC du
> lundi au vendredi. Le Bénin étant à UTC+1, cela tombe localement sur
> **02:00–05:00 et 07:00–11:00** : la seconde fenêtre couvre exactement le début
> de journée de bureau. Différer la génération de storyboard après 11 h locales
> divise ce poste par deux.

> **Détail structurant :** le modèle 480p **facture au clip, pas à la seconde**.
> Un clip fait au minimum 81 images à 16 images/s, soit 5,06 s. Une scène de 3 s
> se paie donc comme une de 5 s. C'est ce plancher qui impose au storyboard de
> ne pas descendre sous 5 secondes par scène animée.

### 2.2 Fixes au mois

| Poste | Fournisseur | Tarif | Statut |
|---|---|---|---|
| Hébergement applicatif | Vercel | selon l'abonnement | **à fournir** |
| Base de données | Supabase (PostgreSQL) | selon l'abonnement | **à fournir** |

### 2.3 Cumulatif — le poste qui change de nature

| Poste | Fournisseur | Tarif public |
|---|---|---|
| Stockage | Cloudflare R2 | **0,015 $ / Go-mois** · classe A 4,50 $/M d'opérations · classe B 0,36 $/M · **sortie gratuite** |

R2 ne se consomme pas, il **s'empile**. Une vidéo générée une fois se stocke
tous les mois : images sources, clips, voix off, rendu final. Franchise de
10 Go-mois.

### 2.4 Au paiement

Le prestataire est en cours de remplacement : **SasPay** succède à GeniusPay.
Tarifs Bénin, identiques sur les trois réseaux (Celtiis Cash, MTN, Moov) :

| Opération | Commission | Qui la porte |
|---|---|---|
| Encaissement | **3,25 %** | **ajoutés** — voir ci-dessous |
| Décaissement | **1,5 % + 100 XOF** | ajoutés |
| Virement du solde vers la banque (*settlement*) | **à relever** — onglet *Tarification* de `app.saspay.me` | nous |

> **« Ajoutés » change tout, et c'est une décision d'affichage.** La commission
> s'ajoute à ce que le payeur règle plutôt que de se déduire de ce qu'on reçoit.
> Un plan Starter annoncé à 15 000 FCFA est donc débité **15 487,50 FCFA**, et
> GenTube encaisse bien 15 000. Le coût direct est nul — mais l'écart se voit sur
> le relevé du client. L'alternative est de l'absorber : 487,50 FCFA par
> abonnement, soit 0,78 $, soit **3,25 % du chiffre d'affaires**.

> **Le décaissement ne nous concerne pas** : c'est l'envoi d'argent vers un
> tiers, et GenTube n'en fait pas — les remboursements se font en crédits, pas
> en espèces (`refundVideo`). Le tarif qui manque est celui du **settlement**,
> le virement du solde SasPay vers le compte bancaire ; c'est un point de
> passage obligé et un endpoint distinct chez eux (`POST /settlements/`).

> **Ce poste est désormais mesuré, pas estimé.** Chaque encaissement relu chez
> SasPay renvoie `client_fee`, `gateway_fee`, `platform_fee`, `debited_amount`
> et `net_amount`. Depuis le 5 septembre 2026, le code les enregistre sur
> `payment_intents.fees_xof` et `.net_xof` à chaque paiement confirmé. C'est le
> seul des treize postes dont le fournisseur donne lui-même le coût exact, et
> il n'a plus à être approché — il suffit d'agréger la colonne.

> **Le mode de commission est un réglage, pas une fatalité.** Leur API accepte
> `fee_charge_mode` en `ADD_ON` ou `DEDUCTED`. Le défaut au Bénin est `ADD_ON`,
> et le code ne l'envoie pas — donc la commission reste portée par le payeur.
> Basculer en `DEDUCTED` est une ligne, et une décision de tarification.

---

## 3. Exemple chiffré : une vidéo de 60 secondes

**Profil A — génération complète.** 60 s, 12 plans animés de 5 s, 480p, format
16:9, voix off Polly neural. C'est le profil nominal du produit.

Hypothèses de calcul : 12 images sources en 848×480, soit 1,553 tuiles chacune ;
narration à 14 caractères/seconde (`lib/storyboard/service.ts:74`, calibré sur
des voix off réellement mesurées), soit 840 caractères.

| Poste | Calcul | Coût |
|---|---|---|
| Modèle vidéo | 12 clips × 0,05 $ | **0,6000 $** |
| Modèle image | 12 × 1,553 tuiles × 0,000287 $ | 0,0053 $ |
| Voix off (Polly neural) | 840 car. × 0,000016 $ | 0,0134 $ |
| Storyboard (DeepSeek) | 2 appels | *non mesuré* |
| Rendu (Lambda) | Go-s × 0,0000166667 $ | *non mesuré* |
| Stockage (R2) | ≈ 25 Mo × 0,015 $/Go-mois | 0,0004 $/mois, **indéfiniment** |
| **Total des trois lignes tarifées** | | **0,619 $** |

**Vendu** 120 crédits × 0,00909 $ = **1,091 $**.
**Marge brute sur les postes connus : 43 %** — avant Vercel, Supabase, Lambda,
DeepSeek et la commission d'encaissement.

### Le résultat qui oriente toute l'étude

**Le modèle vidéo représente 97 % du coût variable connu.** Les dix autres
postes variables, additionnés, pèsent moins que l'arrondi de cette ligne.

Conséquence directe : la précision de l'étude tient presque entièrement au choix
du modèle vidéo. Les autres postes comptent pour la répartition des frais fixes
et pour les produits *non vidéo* (voir §5), pas pour la marge vidéo.

### Les deux variantes qui changent tout

| Variante | Coût variable | Marge brute |
|---|---|---|
| Profil A, voix **Polly** | 0,619 $ | **43 %** |
| Profil A, voix **ElevenLabs** | 0,689 $ | **37 %** |
| Profil A, modèle **wan-3.0-prime** (Atlas, 480p, 0,0612 $/s) | 3,735 $ | **−242 %** |

Le troisième cas n'est pas théorique : c'est un modèle de milieu de gamme
courant. Au tarif actuel, la plateforme perdrait 2,64 $ par minute vendue.

### Profil B — le cas « import », et l'anomalie qu'il révèle

**Profil B.** Le client dépose sa propre vidéo de 60 s ; la plateforme la
transcrit, la découpe en plans, ajoute sous-titres et effets. Aucun modèle
génératif n'intervient : ni image, ni clip, ni voix — la bande son est celle du
client, et le découpage est algorithmique.

| Poste | Coût |
|---|---|
| Transcription (Whisper) | 0,0005 $ |
| Tout le reste des modèles | 0,0000 $ |
| **Total** | **≈ 0,0005 $** + rendu |

**Facturé au même tarif que le profil A** : le plan importé est de type `video`,
donc 2 crédits/seconde (`creditsForShot`, `lib/credits/pricing.ts:129`).

> **Un profil coûte plus de mille fois l'autre et les deux se facturent
> identiquement.** Deux lectures possibles, et c'est une question de
> positionnement plus que de calcul : soit c'est la marge la plus rentable du
> catalogue, soit le service est hors marché — un client qui veut seulement
> sous-titrer sa vidéo paie le prix d'une génération complète et ira ailleurs.

---

## 4. Méthode proposée

### 4.1 Le dénominateur : une vidéo type, pas une seconde

Les treize postes se facturent au clip, au caractère, au jeton, à la tuile, au
Go-**mois**, au Go-seconde, ou en pourcentage. On ne peut rien additionner tant
que ce n'est pas ramené au même objet.

**Proposition : chiffrer 2 ou 3 profils réels de bout en bout** — comme les
profils A et B ci-dessus — plutôt que d'établir un coût à la seconde.

Pourquoi pas la seconde : le storyboard coûte le même prix pour une vidéo de
30 s ou de 90 s (deux appels, point), et le rendu a un coût d'amorçage. Ramener
ces postes à la seconde surévalue les vidéos longues et sous-évalue les courtes.

### 4.2 Mesurer plutôt qu'estimer

Trois postes sont **déjà mesurables**, ils n'ont pas à être estimés :

- **DeepSeek renvoie son compte exact de jetons à chaque appel, et le système le
  jette** (`lib/llm/deepseek.ts:169`). Une ligne de code pour le stocker et ce
  poste devient du réel sur l'historique.
- **Lambda** : CloudWatch conserve durée et mémoire de chaque rendu.
- **R2** : la console donne le volume stocké réel.

Un rendu réel mesuré donne déjà l'ordre de grandeur du fichier livré :
**2,70 Mo pour 16,4 s**, soit environ **9,9 Mo par minute** de vidéo finale
(`render/gentube-demo.mp4`).

### 4.3 Le modèle tarifaire proposé

Découpler le crédit du modèle par une formule plutôt qu'une constante écrite à
la main :

> **crédits/seconde = coût du modèle en $/s ÷ (prix du crédit en $ × part
> fournisseur visée)**, arrondi au crédit supérieur.

Un seul réglage — la part qu'on accepte de reverser au fournisseur — et la
grille se déduit pour n'importe quel modèle, y compris ceux qui n'existent pas
encore. Les « tranches » ne sont que l'arrondi de cette division.

**Ce que la grille actuelle implique sans l'avoir décidé** : 2 crédits/s en face
d'un modèle à 0,00988 $/s, c'est une part fournisseur de **54 %**. Personne ne
l'a choisie ; c'est ce qui tombe du calcul.

À 25 % de part visée, `wan-2.2` passerait de **2 à 5 crédits/seconde**.

Un calculateur interactif reprend cette formule sur six modèles réels :
<https://claude.ai/code/artifact/91acf7d9-9b70-4b2e-95a2-33c7211a8723>

---

## 5. Un angle mort de la grille actuelle

Le crédit est défini comme *une seconde d'image fixe en 480p*. Sur les quatorze
fonctionnalités attendues au catalogue, **huit ne sont ni des vidéos ni mesurées
en secondes** : un portrait n'a pas de durée, un livre audio n'a pas de
résolution.

| Famille de sortie | Fonctionnalités attendues | En service |
|---|---|---|
| **Vidéo** | storytelling · import & amélioration · courte virale · promo produit · captures → présentation · avatar parlant | 2 sur 6 |
| **Audio** | voix off · récit dialogué multi-voix · documents (PDF/Word/PPT) en audio · clonage de voix · génération de musique | 0 sur 5 |
| **Image** | portrait studio · shooting produit · éditions groupées | 0 sur 3 |

La grille actuelle ne sait pas facturer les huit dernières. Ce n'est pas un
réglage à ajuster : c'est une unité de compte à redéfinir.

---

## 6. Ce que nous ne savons pas encore

### 6.1 À fournir par l'exploitation

| Information | Pourquoi elle est indispensable |
|---|---|
| **Volume mensuel** — vidéos produites, clients actifs, minutes livrées | Sans volume, les frais fixes (Vercel, Supabase) ne sont pas répartissables. C'est le chiffre manquant le plus bloquant. |
| **Abonnements Vercel et Supabase** — palier et montant | Deux lignes fixes, entièrement inconnues |
| **Tarif de settlement SasPay** — virement du solde vers la banque | Le seul coût de paiement qui pèse réellement sur nous ; l'encaissement est porté par le client (§2.4) |
| **Répartition d'usage** — part de 480p vs 720p, part animé vs image fixe, part import vs génération | La marge varie du simple au double selon le mix ; un coût moyen sans mix ne veut rien dire |
| **Consommation Lambda réelle** — mémoire configurée, durée moyenne d'un rendu | Disponible dans CloudWatch, jamais relevée |

### 6.2 À mesurer dans le système

- Jetons DeepSeek réels par vidéo (le fournisseur les renvoie déjà)
- Volume R2 réellement occupé, et sa croissance mensuelle
- Poids moyen de l'ensemble des actifs d'une vidéo, pas seulement du rendu final

### 6.3 Un risque, pas un coût

**Edge TTS est gratuit et sans contrat.** Ce n'est pas une ligne de dépense,
c'est une exposition : le jour où il ferme, la voix bascule sur Polly ou
ElevenLabs et la marge voix change du jour au lendemain — d'un facteur infini au
sens strict, et de 0,013 $ à 0,084 $ par minute selon le remplaçant choisi.

---

## 7. Les décisions à prendre

Trois relèvent du calcul, une seule ne peut pas se calculer.

### 7.1 Combien de temps garde-t-on une vidéo livrée ? *(bloquant)*

**Il n'existe aucune politique de purge.** Rien, dans le système, ne supprime
jamais un actif. Le coût de stockage n'est donc pas « X par vidéo » mais « X par
vidéo, tous les mois, pour toujours ».

Tant que cette durée n'est pas fixée, **la ligne R2 n'a pas de valeur finie** —
elle croît linéairement et sans borne. C'est la seule question du dossier qui ne
se calcule pas : elle se décide.

### 7.2 Quelle part fournisseur vise-t-on ?

Aujourd'hui 54 % sur le plan animé 480p, sans que ce soit un choix. Fixer ce
chiffre suffit à déduire toute la grille (§4.3).

### 7.3 Le crédit reste-t-il une seconde de vidéo ?

Soit il devient une unité abstraite que chaque type de sortie consomme à son
propre tarif — une seconde animée, une image rendue, mille caractères narrés —
soit il faut trois grilles séparées. La première voie garde une seule monnaie ;
la seconde garde des prix immédiatement lisibles par le client.

### 7.4 Le modèle devient-il visible au client ?

Un facteur 16 sur le coût ne se dissimule pas derrière un prix unique sans y
perdre. Soit le client choisit sa qualité et voit le tarif changer — le modèle
devient un palier assumé, façon « standard / premium » — soit un seul modèle est
verrouillé par plan et le multi-modèle reste un outil interne.

---

## Annexe A — État technique

Le système est prêt à changer de fournisseur vidéo sans redéploiement : une
variable d'environnement suffit. Deux fournisseurs sont branchés et vérifiés
(Replicate, Atlas Cloud), un troisième sert de banc d'essai (Novita) et n'ira
pas en production.

Atlas Cloud donne accès à près de deux cents modèles vidéo derrière une seule
interface — c'est ce qui rend la comparaison de coûts praticable, et c'est aussi
ce qui rend la grille actuelle intenable.

Deux garde-fous refusent un fournisseur mal branché plutôt que de lui envoyer
des clips payés qui ne reviendraient jamais : l'un vérifie qu'il rappelle bien à
la fin d'une génération, l'autre qu'une route sait lire *ses* rappels à lui.

**L'encaissement suit le même modèle depuis le 5 septembre 2026.** SasPay a
remplacé GeniusPay, derrière une passerelle qui rend le prestataire
interchangeable. Une particularité a orienté toute l'implémentation : la charge
de rappel de SasPay ne porte aucun identifiant venant de nous, donc elle ne peut
pas désigner l'abonnement à créditer. Le rappel sert de **réveil** et c'est la
relecture chez la passerelle qui tranche.

Effet de bord bienvenu, et directement pertinent ici : **un rappel de paiement
perdu n'immobilise plus de crédits.** Le prochain réveil retrouve le paiement.
C'est exactement la reprise qui manque encore du côté vidéo (annexe B).

## Annexe B — Deux écarts internes relevés

- **`creditsForShot` facture sur la durée demandée pendant que `clipCostUsd`
  paie la durée réellement facturée par le fournisseur.** Comme le modèle 480p a
  un plancher de 5,06 s, toute scène animée plus courte sort de la marge. Le
  storyboard s'interdit déjà de descendre sous 5 s, ce qui limite l'exposition
  sans la supprimer.
- **La reprise après un rappel perdu n'existe pas.** La fonction qui
  interrogerait un fournisseur sur l'état d'une génération est écrite mais n'a
  aucun appelant. Un rappel perdu — un déploiement au mauvais moment suffit —
  immobilise des crédits déjà débités sans que personne ne le sache.
