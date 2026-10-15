## 2026-10-03 - [Accessibility]
**Learning:** Icon-only buttons and ambiguous text links within lists (like scene selectors in a storyboard) lack context for screen readers when they only contain non-descriptive text like "#01".
**Action:** Added contextual `aria-label` attribute (in French) to the scene selector button to improve accessibility. Next time, always ensure buttons inside a list have uniquely identifiable and descriptive aria-labels.

## 2026-10-15 - [Accessibility]
**Learning:** Custom radio and checkbox options that use a container `<label>` for styling suffer from double focus rings (or missing prominent focus indicators) if only the native `<input>` receives focus.
**Action:** When creating custom radio options wrapped in a `<label>`, always apply focus ring styles to the parent `<label>` using the `has-focus-visible:` variant (e.g., `has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink`) and explicitly disable the default focus outline on the nested `<input>` with `focus-visible:outline-none`. This ensures a single, well-designed focus ring surrounds the entire styled component during keyboard navigation.
