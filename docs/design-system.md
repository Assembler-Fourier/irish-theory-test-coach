# Design System

Irish Theory Test Coach now uses a restrained commercial design system for a professional Irish education technology product.

## Direction

- Trustworthy, focused, and learner-first.
- Professional rather than playful.
- Lime is reserved for success or strong action accents, not broad decoration.
- No official RSA, Prometric, guaranteed-pass, or official-frequency claims.
- The marketing site explains the product. The learner app keeps the study session quiet and task-focused.

## Tokens

Tokens live in `public/styles.css` under `:root`.

Typography:
- `--font-sans`
- `--font-size-xs`
- `--font-size-sm`
- `--font-size-md`
- `--font-size-lg`
- `--font-size-xl`
- `--font-size-2xl`
- `--font-size-3xl`
- `--line-tight`
- `--line-copy`

Spacing:
- `--space-1`
- `--space-2`
- `--space-3`
- `--space-4`
- `--space-5`
- `--space-6`
- `--space-8`
- `--space-10`
- `--space-12`
- `--space-16`

Colour:
- `--color-bg`
- `--color-bg-warm`
- `--color-surface`
- `--color-surface-soft`
- `--color-surface-raised`
- `--color-text`
- `--color-muted`
- `--color-line`
- `--color-border`
- `--color-primary`
- `--color-primary-strong`
- `--color-primary-soft`
- `--color-accent-lime`
- `--color-accent-lavender`
- `--color-accent-amber`
- `--color-danger`
- `--color-success`

Surfaces, borders, radii, and shadows:
- Cards use `--radius-card` and `--color-line`.
- Buttons use `--radius-md`.
- Pills use `--radius-pill`.
- Shadows use `--shadow-xs`, `--shadow-sm`, `--shadow-md`, and `--shadow-strong`.

Motion:
- `--transition-fast`
- `--transition-base`
- `--transition-slow`
- Motion must remain subtle and respect existing `prefers-reduced-motion` handling.

Breakpoints:
- `--bp-sm`
- `--bp-md`
- `--bp-lg`
- `--bp-xl`
- `--bp-2xl`
- `--bp-wide`

Layers:
- `--z-base`
- `--z-raised`
- `--z-sticky`
- `--z-overlay`
- `--z-modal`

## Component Rules

- Use `.button-primary` for the main commercial action.
- Use `.button-secondary` for alternate but important actions.
- Use `.feature-card`, `.pricing-card`, and `.link-card` for repeated marketing content.
- Keep learner app panels utilitarian and compact.
- Avoid nested cards, fake glassmorphism, excessive gradients, or decorative elements without a product purpose.
- Keep visible non-affiliation wording wherever purchase or trust decisions happen.

## Accessibility

- All interactive controls must keep visible focus states.
- Button and tap targets should stay at least 44px tall.
- Text must not be smaller than 12px.
- Legal and pricing wording must remain visible in static HTML before JavaScript loads.
