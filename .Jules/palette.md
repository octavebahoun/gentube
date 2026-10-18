## 2026-10-03 - [Accessibility]
**Learning:** Icon-only buttons and ambiguous text links within lists (like scene selectors in a storyboard) lack context for screen readers when they only contain non-descriptive text like "#01".
**Action:** Added contextual `aria-label` attribute (in French) to the scene selector button to improve accessibility. Next time, always ensure buttons inside a list have uniquely identifiable and descriptive aria-labels.
## 2024-03-20 - Amélioration des liens "Détails" (Tableaux de données)
**Learning:** Lors de l'utilisation d'icônes avec des textes génériques comme "Détails" dans un tableau, le contexte visuel (la ligne) est perdu pour les utilisateurs de lecteurs d'écran. De plus, il est facile de négliger les indicateurs de focus clavier explicites sur les liens de liste.
**Action:** Utiliser `aria-label` avec le contexte de la ligne (ex: `Détails de la tâche ${id}`) et ajouter systématiquement les classes de focus GenTube (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`).
