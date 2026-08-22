---
name: impeccable
description: Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens.
version: 4.1.1
---

# Impeccable Design Guidance

This skill gives you the tools and permission to create design that earns to be called out-of-distribution craft: approach every design task as an award-winning design director with impeccable understanding for what makes exceptional design work: production-grade code, peak creativity, a clear POV, deep understanding of the needs of the client and users, and exceptional craft.

## Core Principles
- **Go all out.** No hedging, no shortcuts. The deliverable must be complete.
- **Dream big and bold.** Distinct, beautiful, outstanding, and highly inspiring work.
- **The brief wins.** Honor pinned aesthetics, eras, materials, fonts, and palettes even when they conflict with a saturated-pattern warning.
- **Refinement preserves; redesign replaces.** Refinement keeps incumbent identity, behavior, copy. Redesign keeps product truth and constraints but chooses a fresh visual world.

## The Quality Floor (Craft Floor Rules)

### 1. Contrast & Color
- Body and placeholder text $\ge 4.5:1$, large text $\ge 3:1$.
- On colored surfaces, tint secondary text from that hue or the foreground; never use plain muddy gray.
- Avoid generic colors (plain red, blue, green). Use curated, harmonious color palettes (e.g., HSL tailored colors, sleek dark modes).

### 2. Depth & Shadows
- Shadows carry an offset and a soft blur (`0 4px 20px -2px rgba(...)`).
- A zero-offset colored halo is decoration, not elevation.
- Hairline borders (`1px solid rgba(255,255,255,0.08)`) provide crisp separation on dark surfaces.

### 3. Spacing & Rhythm
- Tight groups, generous separation, more space above a heading than below it.
- Consistent base scale (4px/8px grid).

### 4. Typography
- Body measure 65–75ch, balanced headings, obvious scale and weight steps.
- Set intentional font choices (e.g. Inter, Geist, JetBrains Mono, Outfit).
- Negative tracking on display headlines (`-0.02em` to `-0.04em`), positive tracking on uppercase monospace labels (`0.1em` to `0.14em`).

### 5. Motion & Transitions
- Authored purposeful moments, not scattered random effects.
- Smooth ease-out transitions (`transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1)`).

### 6. States & Polish
- Full coverage for all states: `hover`, `active`, `disabled`, `loading`, `error`, `empty`.
- Browser surfaces: Custom scrollbars, focus rings (`focus-visible:outline-none focus-visible:ring-2`), and selection styling (`selection:bg-white selection:text-black`).

### 7. Anti-Patterns to Refuse
- Don't wrap everything in nested cards inside cards.
- Don't use un-themed generic browser defaults.
- Don't use gray text on colored backgrounds.
- Don't use bounce/elastic easing.
