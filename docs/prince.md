# Prince — la logique directe

Tout le back qui n'est pas l'orchestration. La frontière avec Ezechiel est
nette : **il tient l'ordre des étapes, tu écris ce que les étapes et les écrans
lisent et écrivent.** Pas de n8n chez toi.

Sache d'emblée qui dépend de toi : Ahmad et Rosaire font les **écrans**, rien
d'autre. Le côté données de chaque écran qu'ils dessinent est à toi — les quotas
consommés, les compteurs, les erreurs affichées. Ils viendront te demander, et
c'est normal.

## La règle qui gouverne tout ton chantier

**Un échec ne ferme jamais la porte à une reprise.**

L'exemple à copier est le montage. Quand un rendu échoue, la vidéo reste
`rendering` — pas `failed`. Les crédits sont déjà débités, les visuels existent,
et une relance ne repaie rien. La marquer `failed` obligerait à tout refaire.

Le même principe est déjà appliqué partout où ça coûte de l'argent :

- `generateVoiceover` saute les scènes déjà mesurées.
- `finalizeVoiceover` saute les scènes déjà livrées par le bon fournisseur.
- `startRender` renvoie le job existant au lieu d'en démarrer un second.
- Le débit porte la clé d'idempotence `video:<id>:debit`.

Quand tu ajoutes une relance, demande-toi ce qu'elle repaie. Si la réponse n'est
pas « rien », elle est fausse.

---

## Ta voie, ordonnée par qui t'attend

Rien de ce qui suit n'est commencé. L'ordre compte donc plus que la vitesse :
deux personnes sont bloquées derrière le point 1.

### 1. Le journal des événements réels

`activity_logs` existe et ne contient **que des connexions** — il n'est écrit
qu'à un seul endroit, `app/(login)/actions.ts`. Aucune vidéo générée, aucune
étape échouée, aucun crédit débité n'y entre.

Conséquence directe : un tableau de bord d'administration n'aurait rien à
afficher, et Cosme n'aurait rien à auditer. **Rosaire et Cosme attendent tous
les deux ce point.** C'est pour ça qu'il est premier.

Ce qu'il faut journaliser, au minimum : vidéo créée, storyboard généré, voix
mesurée, vidéo validée et débitée, étape échouée avec sa raison, rendu terminé,
vidéo publiée.

### 2. Les lectures d'administration

Il n'y a **aucun** écran ni aucune route d'admin aujourd'hui : le dépôt ne
contient que `app/(dashboard)`. Tout est à écrire.

Ce que l'admin doit voir précisément : le nombre de vidéos générées, les
erreurs, et les **quotas consommés par tenant**. Ce dernier point n'est pas de
l'affichage : c'est un calcul sur le grand livre des crédits, et il est à toi —
pas à Rosaire.

Attention à l'isolation : une lecture d'admin traverse les tenants, donc elle ne
peut pas passer par `tenantDb()` qui filtre dessus. C'est exactement le genre
de requête qui fait fuiter des données entre clients. Écris-la explicitement,
et fais-la relire par Cosme.

### 3. Le tooling et les appels de fonction du paiement

Les agents d'Ezechiel appellent des fonctions ; c'est toi qui les écris. Même
chose pour le chemin de l'argent : ce qui déclenche un paiement, ce qui accorde
les crédits, ce qui constate un échec.

La brique existe — `lib/billing/` porte le catalogue, le checkout et le webhook
GeniusPay — mais elle n'est pas exposée comme des fonctions appelables.

La règle de sécurité qui s'applique ici et qui n'est pas négociable : **un agent
ne décide jamais d'un montant ni d'une destination.** Il demande une action ; la
somme, la clé d'objet et l'identifiant de tenant sont construits par ton code.

### 4. Le suivi après publication et les statistiques

Ce n'est pas « à brancher », ça n'existe pas : il n'y a **aucune table** de
statistiques de vidéo dans le schéma. Ni vues, ni performance.

Et les statistiques YouTube ne viennent pas de l'API qui envoie la vidéo :
c'est une autre API, avec ses propres droits. `youtube_quota_usage` ne parle que
de **notre** quota d'appels, pas des vues d'un client.

Deux personnes attendent derrière : Ahmad pour l'écran de suivi, et l'agent
d'analyse d'Ezechiel, qui ne peut rien proposer sans ces chiffres.

### 5. Les notifications

« Ta vidéo est prête », et relancer un échec sans repayer.

Le canal n'est **pas** une décision technique : ici, un canal qui marche à
Cotonou ne marche pas ailleurs, et un SMS coûte. Pose la question avant de
coder, c'est un choix produit.

Les déclencheurs, eux, sont sûrs : une vidéo qui passe `rendered`, un rendu qui
échoue, un solde qui tombe sous le prix de la prochaine vidéo.

---

## La table `jobs`

C'est ta matière première : `step`, `external_id` (**unique**, pour qu'un webhook
rejoué résolve exactement un job), `status`, `payload`, `error`, `attempts`.

`refundVideo` existe déjà dans `lib/credits/ledger.ts` : il rembourse au plus ce
qui a été réellement facturé et marque la vidéo `failed`. C'est le dernier
recours, pas le premier réflexe — rembourser une vidéo dont les visuels sont
faits, c'est jeter ce qui a été payé.

## La convention de l'app

Presque tout passe par des **server actions**, pas par des API routes — il y en
a cinq en tout dans le projet, et ce sont des webhooks ou des lectures. Le motif
est `validatedActionWithUser` avec `useActionState` côté écran.

Ce motif garantit qu'un utilisateur est connecté, **pas qu'il a le droit**. Le
rôle (`owner`, `admin`, `member`) existe en base : une action réservée à un
`owner` doit le vérifier elle-même, et pas seulement dans l'écran qui l'appelle.

## Ce que tu ne touches pas

Les migrations (`lib/db/migrations/`) : le `_journal.json` casse dès que deux
personnes en génèrent. Tu vas avoir besoin de colonnes nouvelles — le journal,
les statistiques — donc coordonne-toi avec Ezechiel plutôt que de générer en
parallèle.

À lire d'abord : `docs/passation.md`, et `lib/render/service.ts` en entier —
c'est le modèle de reprise le plus abouti du dépôt.
