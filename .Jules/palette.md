## 2024-05-24 - Initial setup\n**Learning:** Started tracking UX/a11y insights.\n**Action:** Create journal.

## 2024-05-24 - Contextual actions in mapped lists
**Learning:** Found that ambiguous action buttons like 'Retirer' within mapped lists lack context for screen readers.
**Action:** Add descriptive, contextual `aria-label` attributes to such buttons (e.g., `aria-label={\`Retirer ${nom(member)}\`}`) to ensure accessibility.
