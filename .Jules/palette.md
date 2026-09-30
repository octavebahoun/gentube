## 2024-03-24 - Accessibility improvements for mapped lists

**Learning:** Contextual actions within mapped lists, even those with text content, often require `aria-label`s. Because the text of an item in a list might be something opaque (like `#01 3s animé`), screen readers cannot infer what action the button will perform (e.g. "Preview this scene"). The context needs to be conveyed via an `aria-label` using the mapping index or context.
**Action:** When adding mapped elements, verify if the action makes sense out of context and if not, add an explicit `aria-label` string.
