# GenTube — répartition du travail

Base : tout ce qui **précède** la production est fait et testé — comptes,
isolation multi-tenant, crédits, paiement GeniusPay, projets, vidéos,
storyboard, voix off. 236 tests verts.

**Rien ne produit encore de vidéo** : le stockage n'est pas implémenté, aucun
provider n'est câblé, le rendu n'existe pas.

---

## Le principe de la répartition

**Le lead prend toutes les tâches qui bloquent quelqu'un d'autre.** Les trois
autres ne doivent jamais attendre après lui.

> ⚠️ Conséquence assumée : le lead devient le chemin critique de toute
> l'équipe. S'il prend du retard, les trois autres s'arrêtent.

| Qui | Fichier | Possède |
|---|---|---|
| **Lead** | [taches-moi.md](taches-moi.md) | Tout ce qui débloque : R2, fixtures, contrat de rendu, tarifs, contrats d'interface, migration consolidée. Puis la chaîne IA et n8n. |
| **Prince** | [taches-prince.md](taches-prince.md) | À quoi la vidéo ressemble, et tout ce que l'utilisateur voit. Templates, éditeur de storyboard, Studio, sound design. |
| **Mourchid** | [taches-mourchid.md](taches-mourchid.md) | Jobs, rendu Lambda, webhooks providers, YouTube, CI. Puis le schéma. Relecteur de Yannick. |
| **Yannick** | [taches-yannick.md](taches-yannick.md) | Catalogue de sons, statistiques, back-office en lecture. Travail relu. |

---

## Ce qui bloque, dans l'ordre

Tout est chez le lead. Le détail est dans son fichier.

1. **Sécuriser R2** — le bucket est en accès public, et il est partagé avec un
   autre projet. À régler **avant la première écriture**, sinon c'est une
   migration de fichiers.
2. **`createAssetStore()`** — le blocage du projet. Libère la voix off, les
   images, les clips, le rendu, et l'upload des sons.
3. **Le corpus de fixtures** — libère Prince entièrement.
4. **Le contrat de rendu vers Hyperframes** (frames → secondes) — libère les
   templates de Prince et le rendu de Mourchid.
5. **Vérifier Studio** (isolation par tenant, panneau de code masquable) —
   libère l'intégration de Prince.
6. **Les tarifs dans le code** — libère l'affichage des prix et les stats.
7. **Les deux poches de crédits** — libère la facturation.
8. **Les quatre contrats** (jobs, n8n↔Next, nommage R2, publication).
9. **Une migration consolidée**, puis le schéma passe à Mourchid.

---

## Séquence

Semaine 1 a une tête série incompressible : personne ne teste de bout en bout
avant R2 + un provider d'image + le rendu.

1. Le lead fait R2 et les fixtures. Prince démarre les templates dès que le
   contrat en secondes est là. Mourchid attaque les jobs. Yannick le
   catalogue.
2. Première vidéo complète : fin de semaine 2, réalistement.

---

## Références

- **Tarifs et coûts réels** : [tarifs.md](tarifs.md)
- **Produit et wireframes** : [produit-et-wireframes.md](produit-et-wireframes.md)
- **Corrections de maquettes** : [wireframes-a-corriger.md](wireframes-a-corriger.md)

---

## Reste à planifier

- [ ] Expiration des quotas de plan
- [ ] Limitation de débit
- [ ] Observabilité / logs
- [ ] Recette de bout en bout
- [ ] Surveillance du plafond GeniusPay : 500 000 FCFA/mois, commission 1,5 %
