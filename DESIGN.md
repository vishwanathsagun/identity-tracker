---
name: Violet Dusk
colors:
  surface: '#1c0e22'
  surface-dim: '#1c0e22'
  surface-bright: '#443349'
  surface-container-lowest: '#16091c'
  surface-container-low: '#24162a'
  surface-container: '#291a2f'
  surface-container-high: '#34243a'
  surface-container-highest: '#3f2f45'
  on-surface: '#f3dbf8'
  on-surface-variant: '#d5c1c8'
  inverse-surface: '#f3dbf8'
  inverse-on-surface: '#3a2b40'
  outline: '#9e8c93'
  outline-variant: '#514349'
  surface-tint: '#ffafd5'
  primary: '#ffafd5'
  on-primary: '#541b3c'
  primary-container: '#935073'
  on-primary-container: '#ffdbe9'
  inverse-primary: '#8a496b'
  secondary: '#dcc2a8'
  on-secondary: '#3d2d1b'
  secondary-container: '#584632'
  on-secondary-container: '#cdb49b'
  tertiary: '#e6b7e8'
  on-tertiary: '#45234b'
  tertiary-container: '#7f5883'
  on-tertiary-container: '#ffd8ff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffd8e8'
  primary-fixed-dim: '#ffafd5'
  on-primary-fixed: '#3a0526'
  on-primary-fixed-variant: '#6f3253'
  secondary-fixed: '#f9dec3'
  secondary-fixed-dim: '#dcc2a8'
  on-secondary-fixed: '#261908'
  on-secondary-fixed-variant: '#554430'
  tertiary-fixed: '#ffd6ff'
  tertiary-fixed-dim: '#e6b7e8'
  on-tertiary-fixed: '#2e0d34'
  on-tertiary-fixed-variant: '#5e3a62'
  background: '#1c0e22'
  on-background: '#f3dbf8'
  surface-variant: '#3f2f45'
typography:
  headline-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 3rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system channels an atmospheric, nocturnal elegance inspired by twilight horizons and dusk illumination. Designed for modern luxury digital products, lifestyle curation platforms, premium creative tools, and immersive media apps, it merges moody depth with intimate warmth.

The aesthetic philosophy centers on **Refined Dark-Mode Glassmorphism**:
- Translucent, frosted glass surfaces suspended over rich plum and violet backdrops.
- Soft, ambient glows cast by muted dusky rose and incandescent warm peach highlights.
- Precise luminous rim borders that outline containers like delicate glass edges catching the fading sunset light.
- A balanced tension between mysterious shadowy depths and soft, radiant human warmth.

## Colors

The color palette captures the transitional tones between twilight and nightfall:

- **Primary (`#935073`)**: Dusky Rose / Mauve. Acts as the principal expressive accent, applied to interactive highlights, subtle linear gradients, active pill badges, and focal UI elements.
- **Secondary (`#F6DBC0`)**: Warm Peach / Sand. Injects high-contrast incandescent warmth. Used for primary CTAs, critical focal points, glowing metrics, and emphasized microcopy against deep plum backgrounds.
- **Tertiary (`#502D55`)**: Deep Royal Purple. Used for subtle glass fills, elevated inner surfaces, secondary card backing layers, and soft backdrop radial flares.
- **Neutral Background (`#1C0E22`)**: Midnight Plum. Serves as the canvas base layer, paired with ambient radial gradients transitioning between `#241429` and `#2D1835`.
- **Text & High Contrast Accents (`#F8F4E9`)**: Off-white / Cream. Dedicated to crisp headline readability, high-legibility body copy, and radiant foreground iconography.

## Typography

The typographic hierarchy pairs **Plus Jakarta Sans** for prominent headers with **Inter** for UI utilities, data displays, and editorial body text.

- **Plus Jakarta Sans** delivers soft geometry and balanced modern curves that match the pillowy silhouettes and glassy radii of the components.
- **Inter** provides objective, neutral precision for micro-labels, dense lists, form fields, and secondary descriptions.
- Headlines leverage tight letter spacing (`-0.02em` to `-0.01em`) to create a cohesive editorial presence, while uppercase metadata and micro-labels utilize wider letter tracking (`+0.02em` to `+0.04em`) to ensure effortless legibility against dark, tinted backdrops.

## Layout & Spacing

The layout is structured around an adaptive 12-column grid on desktop, collapsing to an 8-column layout on tablets and a 4-column layout on mobile viewports.

- **Canvas Margins**: Deep outer borders (`3rem` on desktop, reducing to `1.25rem` on mobile) create a vignette framing effect around the central content.
- **Component Padding Scale**: Internal card paddings follow a generous rhythm, utilizing `space-lg` (`1.5rem`) for cards and containers, and `space-md` (`1rem`) for compact floating sheets and inputs.
- **Rhythm & Gap Rules**: Grouped metadata rows adhere to `space-xs` and `space-sm`, while stacked content modules separate cleanly via `space-xl` gaps to maintain visual breathing room over saturated, moody backgrounds.

## Elevation & Depth

Visual hierarchy relies on multi-layered glassmorphism and subtle atmospheric illumination rather than opaque dropshadows:

1. **Backdrop Blur & Tint**:
   - Surface Level 0 (Base Canvas): Deep gradient layer mixing `#1C0E22` with soft ambient radial glows of `#2D1835` and `#502D55`.
   - Surface Level 1 (Default Glass Cards): Translucent background filled with `rgba(80, 45, 85, 0.25)`, blurred with `backdrop-filter: blur(20px) saturate(140%)`.
   - Surface Level 2 (Floating Modals / Popovers): Elevated fill using `rgba(147, 80, 115, 0.22)`, blurred with `backdrop-filter: blur(32px)`.

2. **Luminous Rim Borders**:
   - Every glass container features a `1px` stroke gradient that simulates an angled light source: transitioning from `rgba(246, 219, 192, 0.28)` at the top edge to `rgba(147, 80, 115, 0.12)` at the bottom edge.

3. **Ambient Halo Shadows**:
   - Modals and prominent hover states cast soft, deeply diffused tinted shadows: `box-shadow: 0 16px 40px -12px rgba(18, 8, 24, 0.7), 0 0 32px 0 rgba(147, 80, 115, 0.15)`.

## Shapes

The design system incorporates full pill and stadium geometries across interactive controls, matched with generous organic corner curves on larger containers.

- **Pill Silhouette**: Buttons, chip pills, search capsules, status badges, and slider tracks use stadium roundness (`roundedness: 3` / 9999px pill curves).
- **Glass Card Containers**: Large panels and modular dashboard tiles apply extended 24px (`rounded-xl`) to 32px curvature, softening the interface against the glowing background gradients.
- **Form Controls & Inputs**: Form fields retain pill curves or relaxed 16px radii, providing smooth tactile feedback.

## Components

### Buttons
- **Primary Action**: Solid Peach fill (`#F6DBC0`) with dark violet text (`#1C0E22`), rendered as a full pill. Hover triggers a soft radial glow (`box-shadow: 0 0 20px rgba(246, 219, 192, 0.4)`).
- **Secondary Action**: Dusky rose tint (`rgba(147, 80, 115, 0.3)`) bordered by a subtle 1px peach/rose gradient rim, off-white text (`#F8F4E9`). Hover brightens the background to `rgba(147, 80, 115, 0.5)`.
- **Ghost / Glass Action**: Fully transparent with a delicate border (`rgba(248, 244, 233, 0.15)`), shifting to a blurred plum fill on press.

### Cards & Glass Panels
- Built with a violet-plum frosted fill (`rgba(45, 24, 53, 0.55)`), layered atop a `16px` to `24px` backdrop blur.
- Framed with an asymmetric top-to-bottom border sheen (`rgba(246, 219, 192, 0.2)` transitioning to `rgba(80, 45, 85, 0.3)`).
- Internal content uses a `space-lg` inset padding.

### Chips & Badges
- Pill-shaped inline containers featuring `space-xs` vertical and `space-md` horizontal padding.
- Filled with low-opacity rose (`rgba(147, 80, 115, 0.25)`) and framed with `rgba(246, 219, 192, 0.2)`. Label text renders in warm peach (`#F6DBC0`) or off-white (`#F8F4E9`).

### Input Fields
- Capsule and rounded fields with a darkened plum-well fill (`rgba(28, 14, 34, 0.6)`) to preserve contrast against surrounding glass cards.
- Bordered by a resting 1px stroke of `rgba(147, 80, 115, 0.35)`.
- Focus state activates an illuminated warm peach border (`#F6DBC0`) accompanied by an outer mauve glow ring (`0 0 0 3px rgba(147, 80, 115, 0.25)`).

### Checkboxes & Radio Controls
- Custom controls styled with `1.5px` border rings in `#935073`.
- Active state displays a warm peach checkmark or inner dot against a filled dusky rose circle, illuminated with a localized soft halo.

### Lists & Navigation Bars
- Floating dock navigation bars encased within a pill-shaped glass container with an elevated backdrop blur.
- List items separated by hairline translucent dividers (`rgba(248, 244, 233, 0.06)`), highlighting with a subtle rose background tint on hover.