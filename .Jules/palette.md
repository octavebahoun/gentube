## 2025-01-01 - Missing ARIA Labels on Video Controls
**Learning:** Icon-only buttons for video playback controls lack ARIA labels, making them inaccessible to screen readers. Relying only on the `title` attribute is insufficient for full accessibility.
**Action:** Add `aria-label` attributes to icon-only buttons like Reculer, Play/Pause, and Avancer to improve keyboard and screen reader accessibility.
