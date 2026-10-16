## 2026-10-03 - [Accessibility]
**Learning:** Icon-only buttons and ambiguous text links within lists (like scene selectors in a storyboard) lack context for screen readers when they only contain non-descriptive text like "#01".
**Action:** Added contextual `aria-label` attribute (in French) to the scene selector button to improve accessibility. Next time, always ensure buttons inside a list have uniquely identifiable and descriptive aria-labels.
## 2026-10-16 - [Accessibility]
**Learning:** Vague text links like "Détails" or "voir la bibliothèque" lack context for screen readers when they do not specify what they point to. Also, duplicate `aria-label` attributes on the same element will cause React typechecking errors.
**Action:** Added contextual `aria-label` attributes to ambiguous links to improve accessibility, and removed duplicate `aria-label`s on a button.
