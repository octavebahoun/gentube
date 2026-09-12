## 2024-05-18 - Missing Aria Labels
**Learning:** GenTube relies heavily on icons for buttons. Icon-only buttons often lack `aria-label` which creates accessibility issues for screen readers. In `StoryboardEditor`, `Rewind` and `FastForward` buttons only had `title` attributes, while `Play/Pause` had neither `title` nor `aria-label`.
**Action:** Always add `aria-label` (in French) to icon-only buttons in the GenTube UI. `title` attributes are helpful for mouse users but `aria-label` is crucial for screen readers.
