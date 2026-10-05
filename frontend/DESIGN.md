---
name: milume
description: Notebook-native spatial omics widgets — Soft Float glass chrome, Framer neutrals
colors:
  canvas-dark: "#1e1e1e"
  canvas-light: "#ffffff"
  plot-border: "#3a3a3a"
  plot-border-light: "#e2e8f0"
  plot-text: "#f1f5f9"
  plot-text-muted: "#94a3b8"
  landmark-cyan: "#00e5ff"
  landmark-magenta: "#ff2d95"
  landmark-lime: "#b8ff00"
  selection-slate: "#a3a3a3"
  neighborhood-teal: "#b3f2e8"
  gene-magenta: "#ff0099"
  gene-lime: "#5cbf00"
  gene-azure: "#0088cc"
  sequential-low: "#f3e6d4"
  sequential-high: "#ff0099"
  categorical-1: "#1f77b4"
  categorical-2: "#aec7e8"
  categorical-3: "#ff7f0e"
  primary: "#171717"
  primary-foreground: "#ffffff"
  background: "#ffffff"
  foreground: "#111111"
  card: "#ffffff"
  muted: "#f5f5f5"
  muted-foreground: "#666666"
  accent: "#f0f0f0"
  border: "#e5e5e5"
  ring: "#a3a3a3"
  dark-background: "#000000"
  dark-card: "#111111"
  dark-popover: "#171717"
  dark-accent: "#242424"
  dark-muted-foreground: "#999999"
  dark-primary: "#ffffff"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  ui:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
  panel-title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  section:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.3
  canvas-legend:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 400
    lineHeight: 1.25
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  widget: "0.75rem"
  panel: "0.875rem"
  control: "0.5rem"
  pill: "9999px"
  legend: "0.25rem"
spacing:
  panel: "0.5rem"
  panel-inset: "0.625rem"
  chrome-gap: "0.625rem"
  toolbar: "0.25rem"
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.25rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "2.25rem"
  card-panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  tool-pill:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    height: "2.5rem"
---

# Design System: milume

## Overview

**Creative North Star: Soft Float + Glass**

milume widgets keep the plot as the specimen and float shadcn chrome above it. Surfaces are Framer-style achromatic neutrals (no blue tint). Docks, sheets, and toolbars share one translucent glass float material (`landmarks-float` + `--lm-float-*` tokens) so the tissue stays visible underneath. A centered icon pill carries draw modes, zoom, and fullscreen. Chrome stays compact in notebook cells; below 640px the layers and info panels stack in one top-left dock (no side rail).

**Key Characteristics:**

- Framer neutrals: white / `#111` light; `#000` / `#111` / `#171` / `#242` dark
- Shared glass float (`landmarks-float`, `--panel` / `--toolbar` shape roles) with backdrop blur
- Centered tool pill: modes + zoom + fullscreen; icon hits, soft muted trays, inverted active glyphs
- Merged right **Controls** dock (Style, Stats, Neighbors, Landmark)
- Narrow ≤640px: one top-left stack (Layers + Info); no side rail or right dock; minimap hidden
- Saturated color reserved for canvas data (landmarks, genes, categories)

## Colors

Restrained achromatic chrome. Data owns saturation on the canvas.

### Chrome (`.milume-widget`)

- **Light:** background/card `#ffffff`, foreground `#111111`, primary `#171717`, muted `#f5f5f5`, muted-foreground `#666666`, border `#e5e5e5`
- **Dark:** background `#000000`, card `#111111`, popover `#171717`, accent `#242424`, primary `#ffffff`, muted-foreground `#999999`, borders at ~10–14% white

### Canvas (`--lm-*`)

Landmark cyan/magenta/lime (and amber/violet/mint) for annotations only.
Categorical points use matplotlib tab* pools sized to the category count
(tab10 / tab20 / tab20+b / tab20+b+c) and avoid that neon triad.
Multi-gene and embedding use additive magenta / lime / azure on the first three
channels (RGB cube legend). Continuous single-gene coloring defaults to warm
cream → magenta. Points and bins share observation signals: categories, genes,
and embedding. Composition bins use majority cell-type colors from the point
palette. Similarity scrubbing uses blue→light→magenta. Selections stay
Framer-neutral greys.

### Named Rules

**The Data Owns Saturation Rule.** Neon hues appear on canvas entities and layer swatches — not on panel fills.

**The Scoped Widget Rule.** Never set `:root` theme tokens globally. Tokens live under `.milume-widget` / `.milume-widget.dark`.

**The Framer Neutral Rule.** Chrome stays achromatic; no blue-tinted OKLCH greys in widget tokens.

## Typography

**UI Font:** system-ui stack

**Character:** Compact Operate type — medium labels, semibold titles, no monospace costume.

### Hierarchy

- **Panel title** (600, 0.8125rem): Layers, Controls
- **Section trigger** (600, 0.6875rem, muted → foreground when open): accordion headers
- **Field label / slider value** (500, 0.6875rem): compact instrument rows
- **Canvas legend** (400, 0.625rem): in-plot only

## Layout

- Shell height default 550px (400–1400); plot fills figure under floating chrome
- Shared chrome scale on `.landmarks`: `--lm-space-*` (4px base), `--lm-chrome-inset`, `--lm-chrome-gap`, `--lm-chrome-band` (3.25rem), `--lm-dock-width` (14rem / 15rem fullscreen)
- Tool pill (`landmarks__chrome-tools`): reserved top band, centered — docks start below band + gap
- Wide: left Layers (Selections, Landmarks) + right Explore (View / Color by) and Info (`landmarks__chrome-dock--*`); max-height accounts for band
- Narrow (`landmarks--narrow`, width < 640px): Info then Explore then Layers in one top-left stack; no side rail, right dock, or minimap
- Wide left dock: Layers fills remaining height and scrolls inside the card (multi-open accordion; no nested list max-heights)
- Narrow stack: Info capped (~45%), Layers flex-fills and scrolls
- Zoom lives in the top tool pill (in / out / reset), not a separate bottom cluster
- Slider rows: single line — left caption + capsule track; fill encodes value; numeral overlays the left of the capsule; thumb nearly invisible until hover/focus. Range sliders (cuts, contrast) use the same capsule
- Inspect collapses both side docks (peek tabs stay); leaving Inspect restores them
- Inspect is a temporary mode with its own chrome (see **Inspect chrome** under Components): the Inspect pill takes the tool pill's slot, the Inspect bar sits bottom centre
- Inspect cube: an immersive takeover of the plot area, not a floating window. `role="dialog"` "Cube" fills the plot area (`z-index` 21, under the top pill at 22) and has no chrome of its own: Save and Exit live on the Inspect pill, the view options on the Inspect bar. Its corners follow `.landmarks__body` (12px, square in fullscreen). While it is open (`.landmarks--cube-open`) the docks and peek tabs float over it at `z-index` 22, so a category or Selection can still be focused to colour it and a saved window reopened from its row. Leaving Inspect closes it. It fades/scales in from the viewport centre (`--duration-quick`), none under `prefers-reduced-motion`

## Elevation & Depth

- Widget body: soft offset shadow (not flat ring-only)
- Shared float tokens (`--lm-float-bg`, `--lm-float-blur`, `--lm-float-shadow`) drive every floating chrome surface
- **Shadow-only Soft Float:** panels and toolbars have no hairline border; elevation is fill + soft drop shadow (craft floor: declare elevation once). `--lm-float-border` stays transparent for token compatibility. One deliberate exception: the Inspect pill's 1px dashed outline marks a temporary mode, not elevation.
- Denser frosted fill (88% card mix, same in light and dark) so borderless glass separates from busy tissue and chrome text holds AA over it
- Panels and toolbars share the same glass material; `--toolbar` is slightly rounder than `--panel`
- Inner chrome stays quiet: slider capsules are fill-only (no inset rings); section dividers use spacing, not rules; segmented controls sit in muted trays without outline strokes
- Tabs / segments: Soft Float sliding pill Tabs (lowercase category / genes / embed) are the Explore color control — `PILL_TABS_LIST` / `PILL_TABS_TRIGGER` in `chrome/sections.ts`.
- Floating View CTA: top-right Soft Float **icon hover flip** (`ViewCta`) for Points/Raster — current mode at rest, hover reveals the destination icon, click commits. View is no longer nested in Explore.
- Explore distill: Color by only in the right dock; similarity scale only when Bins; status copy only when computing/error/pinned; Color-by meta line only for genes/embedding
- Captions and helper text on Soft Float use foreground mixes (`--foreground` ~62–72%), not raw `--muted-foreground`, so tissue behind glass does not wash them out
- Menus / tooltips keep a crisp border (opaque portaled surfaces need an edge)
- Plot canvas: flat — no drop shadows on scatter

Glass is a deliberate float treatment over live canvas, not decorative blur on static chrome.

## Shapes

- Widget shell: 12px (`0.75rem`)
- Panels: ~14px effective radius
- Tool bar and mode hits: full pills (`rounded-full`)
- Layer swatches: circular dots
- Active mode: filled circle inverted against pill tray

## Components

### Tool pill (`Topbar`)

Icon-only select + landmark mode groups, zoom (in / out / reset), and fullscreen. Soft muted trays; active = foreground fill on background glyph. Uses `landmarks-float landmarks-float--toolbar`.

### Inspect chrome

Inspect is temporary, so its chrome replaces the normal chrome rather than adding to it.

- **Inspect pill** (`chrome/inspect-pill.tsx`, `InspectPill`): takes the tool pill's top-centre slot while `mode` is Inspect; the two swap with cube-motion `Rise` (the leaving one is `inert`, no clicks), focus follows the swap, and the tool pill does not rise on first mount. Same `TOOLBAR_CLASS` glass plus a **1px dashed outline** (`.landmarks-toolbar.landmarks__inspect-pill`, muted text at 70%), the only bordered toolbar: it reads as a mode, not a tool. Armed: × Exit Inspect · Box icon + "Inspect" · hint "Click to place a 300 µm window" (size dropped below 640px) · zoom in / out / reset (`ZoomControls`, shared with the tool pill) · full screen. Open: × · "Inspect · 300 µm" · centre "x, y µm" (hidden below 640px) · status chip · Save window (BookmarkPlus → BookmarkCheck "Saved", disabled) · full screen. Labels 0.75rem, meta in `--lm-text-muted`
- **Status chip** (`landmarks__inspect-status`, 0.6875rem, muted): "Refining" with a gradient band sweeping across the text (`landmarks-shimmer`, 1.4s linear, clipped to a span inside the Morph face), crossfading to a resting "Ready" (`Morph`); an error in `text-destructive`, max 14rem (8rem narrow) with an ellipsis and the full text in `title`. No sweep under `prefers-reduced-motion`
- **Inspect bar** (`chrome/inspect-toolbar.tsx`, bottom centre, `TOOLBAR_CLASS`): `Top | Iso | Side` toggle group · divider · Move (hand, `IconBtn`, on = pressed; grab / grabbing cursor in the cube) · Reset view · divider · Adjust · Cross-section. Nothing else on the bar
- **Bar panels** (`ToolStack`, one open at a time, rising right-aligned above their button): the toolbar glass (`TOOLBAR_CLASS`), capped at `min(45cqh, 22rem)` against the widget box (`.landmarks__chrome` is a size container) and scrolling inside (`overscroll-behavior: contain`), so they never cover most of the cube. While a Soft Float slider is dragged (`data-tuning="true"` on the panel), the open panel glass dims to 0.32 opacity so the cube under it stays readable; release restores full opacity. Adjust: two columns, Image | Labels, each a titled section with its Show switch beside the title and a ghost "Reset" right; rows on the shared capsule (one 10rem width), non-slider controls (Mode toggle, Palette swatch dropdown) at the same width; "Reset all" at the foot. Below 640px the columns stack. Cross-section: one section, X / Y / Z range capsules and Reset
- **Selections rows and hover card**: an inspect entry's row shows its cube thumbnail (the 64×40 snapshot cropped into a 1.75rem square, `.landmarks-layer-thumb`, rounded, edged in the selection colour) where other rows have the dashed swatch. Every selection row opens a shadcn `HoverCard` to its right (`.landmarks__selection-card`: 14rem, `FLOAT_PANEL` glass, portalled to the widget root, no entrance under reduced motion): thumbnail (full width, 64/40), name, "N cells", window or extent in `landmarks-meta`, then three category bars (label · track at fg 10% · %), filled in the category colours

### Glass docks

`landmarks-float landmarks-float--panel` on Card. Layers (Selections, Landmarks). Explore (Color by Category/Genes/Embedding; similarity when Raster). Info (selection-linked composition / gene densities). Floating View CTA (top-right Soft Float icon hover flip) for Points/Raster.

### Compact fields

`SliderRow` — single-line instrument row: left-aligned label, rounded-rect capsule whose fill denotes the value, tabular numeral inside the fill (left), thin thumb that stays quiet until hover/focus. Soft segment toggles for neighborhood/buffer.

Shared Soft Float slider chrome (Impeccable extract): `chrome/soft-float-slider.tsx`
- `SoftFloatCapsuleSlider` — unidirectional (tension, neighborhood, point buffer)
- `SoftFloatSignedSlider` — signed / both-mode buffer (center snap mark only)
- `SoftFloatSliderReset` — Lucide `rotate-ccw`, immediately right of the capsule

Both capsule variants share `.landmarks-slider-control` CSS tokens (`--lm-slider-fill`, `--lm-slider-thumb*`, `--lm-slider-value-*`) and the same `data-slot` hooks so handle, fill, value text, and hover/press stay aligned.

### Accordion sections

`+` when closed, `−` when open (crossfade). No chevron rotation.

### Narrow stack

Below 640px, Info (capped) then Layers (flex-fill + scroll) share one top-left dock.

### Shared float surface

Tokens on `.landmarks`: `--lm-float-radius`, `--lm-float-border`, `--lm-float-bg`, `--lm-float-blur`, `--lm-float-shadow`. Class `landmarks-float` applies the material; `--panel` / `--toolbar` only change radius. Legacy `landmarks-float-panel` / `landmarks-float-toolbar` alias the same tokens.

### Chrome tokens

One set for the main tool pill, View CTA, context L1/L2, Inspect pill, Inspect bar and peek tabs. Class constants in `chrome/primitives.tsx`; values on `.landmarks` in `landmarks.css`.

| Role | Class / constant | Tokens |
| --- | --- | --- |
| Toolbar surface | `TOOLBAR_CLASS` (`landmarks-float--toolbar landmarks-toolbar`) | `--lm-toolbar-h` 2.5rem, `--lm-toolbar-pad` / `--lm-toolbar-gap` 0.25rem, `--lm-toolbar-divider` (fg 22%) |
| Icon hit / toggle item | `chromeHitClass` (`landmarks-hit`), `--wide`, `--text` | `--lm-hit-size` 2rem, full radius, idle `--lm-hit-fg` (fg 72%), hover `--lm-hit-hover-bg` (fg 9%), disabled 0.4 |
| On state | `aria-pressed="true"`, `data-state="on"`, or `chromeHitOnClass` | `--lm-hit-on-bg` foreground / `--lm-hit-on-fg` background, kept on hover (sliding Explore tabs use it too) |
| Slider row | `SoftFloatSliderRow` / `SoftFloatCapsuleSlider` / `SoftFloatSignedSlider` | caption (`--lm-caption`) · 1.75rem capsule, readout inside left, neutral `--lm-slider-fill`; ranges are the same capsule with two thumbs |
| Chip / badge | `CHIP_CLASS` (`landmarks-chip`) | `--lm-chip-bg` card, `--lm-chip-fg` foreground, `--lm-chip-border` (fg 50% into card, ≥3:1 on glass and muted trays) |
| Swatch edge | `.landmarks-layer-swatch` | `--lm-swatch-ring` (light only, fg 55%) |

## Do's and Don'ts

### Do:

- **Do** scope tokens under `.milume-widget` and follow notebook light/dark ancestors.
- **Do** keep docks ~14rem; scroll inside panels.
- **Do** use the shared glass float tokens for every floating chrome surface.
- **Do** prefer shadcn primitives with Soft Float surface classes.
- **Do** stack Layers + Info in one top-left dock under 640px (no side rail).

### Don't:

- **Don't** reintroduce blue-tinted chrome or phosphor/monospace HUD styling.
- **Don't** set global `:root` / `body` colors from widget CSS.
- **Don't** stack Inspect + Tools as two separate right cards — use merged Controls.
- **Don't** apply drop shadows to the plot canvas.
- **Don't** hand-roll buttons/inputs when a shadcn component exists.
- **Don't** invent a second float material for toolbars — use `landmarks-float`.
