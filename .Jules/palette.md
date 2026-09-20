## 2024-10-24 - Accessibility on shot selection buttons
**Learning:** Found an accessibility issue pattern specific to `app/(dashboard)/dashboard/videos/[id]/storyboard.tsx`. The shot selection buttons on the UI only had text containing indices or duration which is out of context without a descriptive `aria-label`.
**Action:** Always add descriptive `aria-label`s on similar UI controls, especially when they represent interactive elements such as selecting scenes in a list. Used French (`Voir la scène ${index + 1}`) to align with the primary language of the application UI.
