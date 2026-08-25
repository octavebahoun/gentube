# Wireframes — corrections à appliquer

Sept maquettes datent d'avant deux changements : le passage à **Hyperframes**
et la révision des tarifs du 25 août 2026.

La 13 (`13-studio-hyperframes.svg`) est déjà à jour et sert de référence.

---

## Les quatre causes

1. **720p : 4 crédits/s → 3 crédits/s**
2. **Recharge : 3 000 crédits ≈ 50 min → 360 crédits = 6 min**
3. **Voix par défaut : ElevenLabs → Amazon Polly** (ElevenLabs reste sur Pro)
4. **Assemblage : Remotion → Hyperframes**

Et une omission : les écrans de storyboard n'ont pas l'onglet **Studio**.

---

## 01-accueil.svg — page publique

| Texte actuel | Remplacer par |
|---|---|
| `1 333 crédits ≈ 22 min en 480p` | `1 320 crédits ≈ 22 min en 480p` |
| `3 000 crédits ≈ 50 min en 480p` | `2 700 crédits ≈ 45 min en 480p` |
| `1 crédit = 1 seconde de vidéo en 480p (4 crédits en 720p)` | `… (3 crédits en 720p)` |

Le reste est bon : « Dès 15 000 FCFA/mois » et « les crédits achetés
n'expirent pas » restent vrais.

---

## 02-connexion-inscription.svg

Rien à changer. « à partir de 15 000 FCFA/mois » reste exact.

---

## 03-dashboard-workspace.svg

| Texte actuel | Remplacer par |
|---|---|
| `crédits ≈ 50 min en 480p · 12 min en 720p` | `crédits ≈ 45 min en 480p · 15 min en 720p` |
| `1 950 / 3 000 crédits utilisés ce cycle` | `1 950 / 2 700 crédits utilisés ce cycle` |
| `1 crédit = 1 s en 480p · 4 crédits = 1 s en 720p` | `… · 3 crédits = 1 s en 720p` |

*(45 min ÷ 3 = 15 min de 720p, contre 12 avant.)*

---

## 05-projet-configuration.svg

| Texte actuel | Remplacer par |
|---|---|
| `Clips animés — 1 crédit/s en 480p, 4 crédits/s en 720p.` | `… 3 crédits/s en 720p.` |
| `Voix : liste = George, Liam, Antoni, Anaïs, Rachel, ou un identifiant ElevenLabs personnalisé.` | `Voix : voix Amazon Polly (Léa, Rémi…). Les voix ElevenLabs et les identifiants personnalisés sont réservés aux plans Pro et Business.` |

C'est l'écran où la montée en gamme se joue : il doit **montrer** que les
voix premium existent et qu'elles sont verrouillées, pas les cacher.

---

## 06-nouvelle-video.svg

| Texte actuel | Remplacer par |
|---|---|
| `720p` / `4 crédits par seconde` | `3 crédits par seconde` |

Le reste est bon.

---

## 07-storyboard.svg et 08-storyboard-etats.svg

Il manque l'**onglet Studio** à côté de « Storyboard », tel qu'il apparaît
dans la 13.

Sans lui, la 13 semble sortir de nulle part : rien dans le parcours n'y mène.

---

## 09-progression-pipeline.svg

| Texte actuel | Remplacer par |
|---|---|
| `Assemblage (Remotion + Lambda)` | `Assemblage (Hyperframes + Lambda)` |

À vérifier aussi : `30–40 s par plan en 480p, ~150 s en 720p` — ces durées
venaient de Remotion. Elles seront à remesurer sur Hyperframes, mais on peut
les laisser en attendant.

---

## 10-facturation.svg — le plus touché

| Texte actuel | Remplacer par |
|---|---|
| `3 000` (grand chiffre du solde) | `2 700` |
| `crédits ≈ 50 min en 480p · 12 min en 720p` | `crédits ≈ 45 min en 480p · 15 min en 720p` |
| `1 950 / 3 000 crédits utilisés ce cycle` | `1 950 / 2 700 crédits utilisés ce cycle` |
| `1 333 crédits ≈ 22 min en 480p` | `1 320 crédits ≈ 22 min en 480p` |
| `3 000 crédits ≈ 50 min en 480p` (plan Pro) | `2 700 crédits ≈ 45 min en 480p` |
| `3 000 crédits — 5 000 FCFA` (recharge) | `360 crédits — 5 000 FCFA` |

Déjà juste, à garder tel quel : « Les crédits achetés n'expirent pas,
contrairement au quota mensuel du plan. » C'était anticipé avant même qu'on
tranche.

**Une chose manque** sur cet écran : les 15 premiers clients gardent leur
tarif pendant 1 an. Si c'est un argument de vente, il doit se voir quelque
part — ici ou sur la page publique.
