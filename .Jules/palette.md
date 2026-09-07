## 2024-05-18 - [Add ARIA labels to playback controls]
**Learning:** Video player controls are often icon-only, which causes accessibility issues.
**Action:** Always add appropriate ARIA labels dynamically based on state (e.g. `aria-label={isPlaying ? "Pause" : "Lecture"}`).
