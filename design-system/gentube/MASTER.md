# GenTube — Design System Master File

## Artistic Direction
- **Universe**: AI × Cinema × Motion × Creative Studio
- **Style**: Cinematic, premium, dark, immersive, technological (not cyberpunk)
- **Concept**: Professional video editing software aesthetic, avoiding generic violet/white SaaS templates.
- **Inspirations**: Cinema studios, motion design tools, professional video editing software (Premiere Pro, DaVinci Resolve, After Effects).

---

## Palette & Color Tokens

| Role | Hex Code | CSS Variable | Description / Usage |
|------|----------|--------------|---------------------|
| Main Background | `#050608` | `--color-bg-primary` | Deep obsidian canvas |
| Secondary Background | `#0B0D10` | `--color-bg-secondary` | Dark panel background & sidebar |
| Surface | `#111419` | `--color-surface` | Cards, panels, timeline tracks |
| Surface Elevated | `#171A20` | `--color-surface-elevated` | Floating dialogs, tooltips, modals |
| Border | `#292D35` | `--color-border-subtle` | Fine subtle dividers |
| Primary Text | `#F5F5F5` | `--color-text-primary` | High-contrast headers & body |
| Secondary Text | `#A5A7AD` | `--color-text-secondary` | Muted labels, metadata & timecodes |
| Primary Action Accent | `#FF7A18` | `--color-accent-orange` | Primary buttons, playheads, key actions |
| AI Accent | `#A855F7` | `--color-accent-purple` | AI generation buttons, AI tags, AI assistant |
| Luminous Accent | `#FFB45C` | `--color-accent-light` | Hover glows, active highlights |
| Success Status | `#35D07F` | `--color-status-success` | Render complete, active tracks, green indicators |
| Error Status | `#FF4D5A` | `--color-status-error` | Validation errors, failed renders, alerts |

### Color Rules
- **Orange (`#FF7A18`)** is the primary action color across the UI.
- **Purple (`#A855F7`)** is specifically reserved for AI features (Script generation, Voice generation, Scene AI, Prompt-to-video).
- **Gradients**: Kept subtle and elegant, transitioning from Orange (`#FF7A18`) to Purple (`#A855F7`).

---

## Typography

- **Font Family**: Modern font stack (`Inter`, `Geist`, `Manrope` / `Space Grotesk` display + `Space Mono` for timecodes/data).

| Level | Size Range | Weight | Line Height | Usage |
|-------|------------|--------|-------------|-------|
| **Display** | 56–72px | 700–800 | 1.02 | Hero titles, major showcases |
| **H1** | 48–64px | 700 | 1.05 | Page headers, main section titles |
| **H2** | 36–48px | 700 | 1.10 | Card section titles, modal headers |
| **H3** | 22–28px | 600 | 1.20 | Component headings, panel titles |
| **Body** | 16–18px | 400–500 | 1.60 | Paragraphs, descriptions |
| **Small / Label** | 12–14px | 500–700 | 1.50 | Monospace labels, timecodes, metadata |

---

## Component System Specs

### General Style Rules
- **Border Radius**: 10px – 16px (`rounded-xl` to `rounded-2xl`).
- **Borders**: Fine 1px subtle borders (`#292D35`).
- **Shadows**: Deep, low-visibility dark drop shadows (`0 20px 50px -15px rgba(0,0,0,0.8)`).
- **Glows**: Subtle orange/purple glows on hover and active states (`box-shadow: 0 0 20px -5px rgba(255, 122, 24, 0.3)`).
- **Glassmorphism**: Minimal and restrained, limited to floating Navbars and Studio Toolbars with dark backdrop blur.
- **Transitions**: 150ms – 250ms smooth cubic-bezier easing.

---

## Component Catalog

1. **Button**: Primary (Orange), AI (Purple), Secondary (Dark Surface), Ghost.
2. **Badge**: Status indicators (Success, AI, Draft, Rendering).
3. **Card / VideoCard / FeatureCard / PricingCard / MediaCard**: Dark surface cards with fine borders & subtle hover elevation.
4. **Input & Select**: Studio-style inputs with `#171A20` fill, fine `#292D35` border, and orange/purple focus ring.
5. **Modal / Tooltip**: High-contrast floating panels with backdrop blur.
6. **Navbar**: Sleek, sticky dark header with logo, links, balance meter, and CTA.
7. **Tabs & ProgressBar**: Studio-grade track switchers and rendering progress gauges.
8. **Timeline**: Video, audio, and caption tracks with timecodes, playhead, and keyframe handles.
9. **AIAction**: Specialized purple-accented triggers for AI prompt execution.
10. **Toast**: Floating alert notifications for system feedback.
