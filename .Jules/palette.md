## 2024-03-22 - Focus and aria-labels for dynamic list buttons
**Learning:** Adding `aria-label` to dynamically mapped items without native visible text (or ambiguous text) drastically improves screen reader experience. Focus rings must also be explicitly set (`outline-none focus-visible:outline-2 ...`) rather than relying on browser defaults which can be obscured by custom borders.
**Action:** Always verify if mapped buttons (like carousel or storyboard thumbnails) have descriptive aria-labels and visible keyboard focus.
