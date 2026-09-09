## Palette's UX Journal

## 2024-10-24 - Missing ARIA labels on playback controls
**Learning:** Missing ARIA labels are a common issue for icon-only playback buttons that use generic HTML `button`s instead of existing design system `Button` components. `title` attributes alone aren't sufficient for all screen readers.
**Action:** Always add `aria-label` to custom icon-only playback controls, making sure dynamic states (e.g., Play/Pause) update the `aria-label` accordingly.
