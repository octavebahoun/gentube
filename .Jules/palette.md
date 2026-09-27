## 2024-05-18 - Adding contextual \`aria-label\`s to lists
**Learning:** Contextual action elements within lists (such as a "Remove" button or a "Details" link) need explicit \`aria-label\`s to be accessible to screen reader users, because the visual context isn't available.
**Action:** When adding icon-only or ambiguous text buttons (like "Détails" or "Retirer") in mapped lists, always include a descriptive \`aria-label\` (e.g., \`aria-label={\`Retirer \${member.name}\`}\`).
