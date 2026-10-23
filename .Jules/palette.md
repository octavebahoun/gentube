## 2026-10-03 - [Accessibility]
**Learning:** Icon-only buttons and ambiguous text links within lists (like scene selectors in a storyboard) lack context for screen readers when they only contain non-descriptive text like "#01".
**Action:** Added contextual `aria-label` attribute (in French) to the scene selector button to improve accessibility. Next time, always ensure buttons inside a list have uniquely identifiable and descriptive aria-labels.

## 2026-10-04 - [Accessibility]
**Learning:** When styling custom radio or checkbox options using container `<label>` elements (where the native input is not visually hidden but still used structurally), ensuring the parent `<label>` has focus ring styling (e.g., `has-focus-visible:outline-2`) and adding `focus-visible:outline-none` to the nested `<input>` prevents double focus rings while ensuring clear focus states for keyboard navigation.
**Action:** Applied focus-visible utility classes to the custom radio option components (`ChoiceGroup` and `TypeChoice`) wrapper `<label>` tags and disabled native input outlines. Next time, always ensure custom label wrappers provide strong visual focus cues while native inner inputs omit default outlines.
