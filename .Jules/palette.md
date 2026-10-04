## 2024-05-24 - Ambiguous "Retirer" button lacks context
**Learning:** In lists of items (like members), generic action text like "Retirer" (Remove) is ambiguous for screen reader users because they don't know *what* or *who* they are removing unless they read the surrounding context. This directly violates the accessibility convention established in memory.
**Action:** Add descriptive `aria-label` to these contextual buttons, e.g., `aria-label={\`Retirer ${nom(member)}\`}`.
