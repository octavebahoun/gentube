# Moi — chaîne IA, orchestration n8n, arbitrages

Je possède **ce que la vidéo raconte** : les prompts, les providers, la
séquence. Et les décisions que personne d'autre ne peut prendre.

---

## D'abord : les décisions qui bloquent les autres

Une ligne chacune. Tant qu'elles ne sont pas tranchées, quelqu'un attend.

- [x] **720p : 4 crédits/s** — tranché. Le double du 480p, c'est voulu.
- [ ] **Recharge 5 000 FCFA / 3 000 crédits** — elle perd de l'argent.
      → bloque la page tarifs de Prince
- [x] **Les crédits de plan expirent** — tranché. Reste à distinguer les
      crédits de recharge, qui n'expirent pas.
- [x] **Images : Cloudflare Workers AI** — tranché. Replicate reste pour les
      clips vidéo uniquement.
- [x] **Studio embarqué** — tranché. Les deux vérifications deviennent
      bloquantes.
- [x] **Qui relit Yannick — moi ?** (≈25 % du temps du relecteur)
- [ ] **Landing publique maintenant **
- [ ] **Un seul propriétaire du schéma** (Mourchid)

---

## 1. Images — Flux

`CLOUDFLARE_AI_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` sont déjà dans `.env`.
Workers AI sert Flux à un coût sans commune mesure avec Replicate.

**Décidé : les images passent par Workers AI.** Replicate ne sert plus qu'aux
clips vidéo.

À valider en cours de route : la qualité en ratio 9:16, la latence, et le coût
réel par image.

Écriture attendue : `shots.asset_url`, via `AssetStore.put()` de Mourchid.
Jamais de client S3 en direct.

---

## 2. Clips vidéo — Replicate

Pour les plans `type: 'video'`. Asynchrone : Replicate rappelle par webhook,
et `jobs.external_id` est déjà **unique** pour qu'un webhook rejoué résolve
exactement un job.

Le motif de webhook à suivre existe, écrit et testé : `lib/billing/webhook.ts`.

---

## 3. Qualité du storyboard — `lib/llm/`

DeepSeek en P1, Anthropic en P2. Modèle : `deepseek-v4-flash`.

**Le piège, déjà rencontré :** ce sont des modèles de raisonnement. Avec un
budget de tokens trop serré, ils dépensent tout en raisonnement et renvoient un
contenu **vide**. Le client lève une erreur explicite dans ce cas — si tu la
vois, augmente `DEEPSEEK_MAX_TOKENS` ou demande moins de scènes.

Le prompt interdit explicitement au modèle d'écrire une durée, et le serveur
force le type de scène et supprime les sons inventés. **Ne relâche aucune des
trois** : c'est ce qui empêche le modèle de casser le rendu.

À travailler : la qualité des narrations et des prompts visuels. C'est moi qui
sais à quoi ressemble une bonne sortie — personne d'autre ne peut juger ça.

Calibrage actuel : ~14 caractères de narration par seconde d'audio.
Si les voix changent, ce nombre change.

---

## 4. Orchestration n8n

La séquence : voix off → images → clips → rendu → publication.

**Le contrat à figer avec Mourchid, avant d'écrire un workflow :**

- Dans quel sens ça appelle — n8n interroge notre API, ou l'app déclenche des
  webhooks n8n ?
- Quelle authentification ?
- **Qui détient les clés providers** — n8n ou l'app ? C'est ça qui décide si
  n8n est l'orchestrateur ou un simple exécutant.

Et la question qui traîne : **où vit la vérité** de « où en est cette vidéo » ?
Dans `videos.status` ou dans les lignes `jobs` ? Si les deux, elles divergeront.

---

## 5. Notifications — récupérées de Yannick

Géré par n8n, hors de l'application.

- [ ] Vidéo prête
- [ ] Vidéo échouée
- [ ] Paiement échoué (les réessais s'arrêtent à 3 tentatives)
- [ ] Solde de crédits bas

Canal à décider : email, ou WhatsApp vu le marché.

---

## 6. Reprise sur échec

Les providers d'IA échouent régulièrement. À définir : combien de tentatives,
quel délai, et **qui paie** quand un plan est régénéré après un échec.

C'est une question d'argent autant que de technique — donc c'est la mienne.

---

## 7. Coût par vidéo — chiffré le 25 août 2026

**Une minute de vidéo en 480p coûte environ 400 FCFA :**

| Poste | Coût |
|---|---|
| Replicate — 12 clips de 5 s à 0,05 $ | 375 FCFA |
| Amazon Polly Neural + speech marks | 10 FCFA |
| Rendu Lambda | ~12 FCFA |
| DeepSeek, R2 | négligeable |

En 720p, les clips passent à 0,11 $ → la minute coûte **~850 FCFA**.

Base : 1 $ = 625 FCFA. Replicate facture **par vidéo générée**, pas par
seconde : 81 images à 16 fps = 5,06 s de clip.

### Décisions actées

- [x] **Marge cible : 40 %**, avec 5 mois d'investissement à perte assumés.
- [x] **Les 15 premiers clients gardent leur tarif pendant 1 an**, même après
      la hausse. C'est aussi l'argument de lancement.
- [x] **Amazon Polly Neural remplace ElevenLabs** en voix par défaut.
      5× moins cher, et 1 M de caractères gratuits par mois pendant 12 mois —
      donc la voix est quasi gratuite sur toute la période d'investissement.
      **Les speech marks sont obligatoires** : c'est ce qui fournit les timings
      mot à mot dont dépendent les sous-titres et les durées mesurées.
- [x] **ElevenLabs devient un argument de montée en gamme** — réservé aux
      plans Pro et Business. Le français de Polly est plus robotique, donc la
      qualité de voix devient une raison d'acheter le plan supérieur.

### Conséquence sur les plans

À 40 % de marge, **aucune hausse de prix n'est nécessaire** — il suffit de
corriger les minutes incluses :

| Plan | Prix | Minutes 480p | Coût | Marge |
|---|---|---|---|---|
| Starter | 15 000 FCFA | 22 min | 8 800 | 41 % |
| Pro | 30 000 FCFA | 45 min | 18 000 | 40 % |

- [ ] **Recharge 5 000 FCFA : reste à corriger.** À 3 000 crédits elle vend
      50 min (20 000 FCFA de coût) pour 5 000. À 40 % de marge, le pack devrait
      faire **~450 crédits**, pas 3 000.

---

## 7 bis. Suivi du coût réel

Le prix en crédits doit rester tenable. Aujourd'hui personne ne mesure le coût
réel d'une vidéo en FCFA : voix off + images + clips + rendu.

Contrainte externe à ne pas oublier : GeniusPay plafonne à **500 000 FCFA par
mois** pour toute la plateforme, commission **1,5 %**. Et YouTube limite à
~6 uploads par jour, tous tenants confondus.

---

## À vérifier avant de figer l'UI

- [ ] Lire le code de `@hyperframes/studio-server` — isolation par tenant
      possible, ou dossier de travail unique ?
- [ ] Le panneau de code CodeMirror de Studio est-il désactivable ?
- [ ] Ouvrir une issue licence chez HeyGen — aucun des 11 paquets
      `@hyperframes/*` ne déclare de champ `license`
