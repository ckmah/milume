---
name: milume
description: Notebook-native spatial omics widgets. Bracketed tactical veil over live tissue.
colors:
  tact-mark: "#edb54a"
  tact-accent-ink: "#111111"
  tact-ink: "#1a1a1a"
  tact-ink-dark: "#f2f2f2"
  tact-muted: "#3a3a3a"
  tact-muted-dark: "#d0d0d0"
  tact-tone: "rgba(26, 26, 26, 0.1)"
  tact-tone-dark: "rgba(242, 242, 242, 0.16)"
  tact-surface: "rgb(214 214 214 / 97%)"
  tact-surface-dark: "rgb(0 0 0 / 65%)"
  tact-edge: "rgba(26, 26, 26, 0.14)"
  tact-edge-dark: "rgba(255, 255, 255, 0.14)"
  tact-rule: "rgba(26, 26, 26, 0.78)"
  tact-rule-dark: "rgba(242, 242, 242, 0.78)"
  tact-track: "rgba(26, 26, 26, 0.28)"
  tact-track-dark: "rgba(242, 242, 242, 0.28)"
  tact-range: "rgba(26, 26, 26, 0.62)"
  tact-range-dark: "rgba(242, 242, 242, 0.62)"
  primary-foreground: "#f2f2f2"
  primary-foreground-dark: "#141414"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-dark: "oklch(0.704 0.191 22.216)"
  canvas-light: "#e8e8e8"
  canvas-dark: "#141414"
  plot-border: "#3a3a3a"
  plot-border-light: "#e5e5e5"
  plot-bg-image: "#000000"
  landmark-cyan: "#00e5ff"
  landmark-magenta: "#ff2d95"
  landmark-lime: "#b8ff00"
  selection-neutral: "#a3a3a3"
  neighborhood-teal: "#b3f2e8"
  gene-magenta: "#ff0099"
  gene-lime: "#5cbf00"
  gene-azure: "#0088cc"
  sequential-low: "#f3e6d4"
  sequential-high: "#ff0099"
  categorical-1: "#1f77b4"
  categorical-2: "#aec7e8"
  categorical-3: "#ff7f0e"
  lajolla-low: "#191900"
  lajolla-high: "#fffecb"
typography:
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  section:
    fontFamily: "\"IBM Plex Mono\", ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: "0.14em"
  label:
    fontFamily: "\"IBM Plex Mono\", ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.12em"
  tab:
    fontFamily: "\"IBM Plex Mono\", ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.08em"
  switch:
    fontFamily: "\"IBM Plex Mono\", ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.14em"
  readout:
    fontFamily: "\"IBM Plex Mono\", ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.04em"
  canvas-legend:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.25
  ruler-tick:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: 1
rounded:
  chrome: "0px"
  widget: "0px"
  legend: "0px"
spacing:
  panel-inset: "10px"
  panel-pad: "10px"
  text-start: "36px"
  lead: "32px"
  row-gap: "4px"
  hit: "32px"
  edge-end: "20px"
  band-inset: "4px"
  trail-hit: "24px"
  sub-gap: "6px"
  chrome-inset: "0.5rem"
  chrome-gap: "0.25rem"
  chrome-band: "3.75rem"
  dock: "17rem"
  bracket: "10px"
components:
  button-hit:
    backgroundColor: transparent
    textColor: "{colors.tact-ink}"
    rounded: "{rounded.chrome}"
    padding: "0"
    height: "2rem"
    width: "2rem"
  button-hit-hover:
    backgroundColor: "{colors.tact-tone}"
    textColor: "{colors.tact-ink}"
    rounded: "{rounded.chrome}"
    padding: "0"
    height: "2rem"
    width: "2rem"
  button-hit-on:
    backgroundColor: "{colors.tact-mark}"
    textColor: "{colors.tact-accent-ink}"
    rounded: "{rounded.chrome}"
    padding: "0"
    height: "2rem"
    width: "2rem"
  card-panel:
    backgroundColor: "{colors.tact-surface}"
    textColor: "{colors.tact-ink}"
    rounded: "{rounded.chrome}"
    padding: "{spacing.panel-inset}"
  menu-item:
    backgroundColor: transparent
    textColor: "{colors.tact-ink}"
    rounded: "{rounded.chrome}"
    padding: "0 8px"
    height: "28px"
  menu-item-highlighted:
    backgroundColor: "{colors.tact-mark}"
    textColor: "{colors.tact-accent-ink}"
    rounded: "{rounded.chrome}"
    padding: "0 8px"
    height: "28px"
  section-label:
    textColor: "{colors.tact-ink}"
    typography: "{typography.section}"
    rounded: "{rounded.chrome}"
---

# Design System: milume

## Overview

**Creative North Star: "Bracketed Tactical Veil"**

milume floats instrument chrome over a live spatial plot. The chrome is square, translucent, and bracketed at the corners. IBM Plex Mono carries the labels. Gold (`#edb54a`) is the only chromatic chrome color, and it marks the active state.

Docks, sheets, toolbars, and `.tact-popup` share one veil. The fill is `--tact-surface`, the blur is 4px, the edge is 1px `--tact-edge`, and the shadow is `--tact-lift`. Each corner draws a 10px by 1px `--tact-rule` stroke. An active hit, a highlighted menu row, and the on half of a switch fill with `--tact-accent` and set the ink to `#111111`.

The surface is Operate. The data and the tools lead. A control that only tunes the picture stays off screen when the default is right for most datasets. Tokens live on `.milume-widget` and `[data-milume-portal]`, never on `:root`.

**Key Characteristics:**

- Gold mark `#edb54a` for active chrome, with `#111111` ink on that fill
- Veil surface, 4px blur, 1px edge, and `--tact-lift` (`0 8px 24px rgba(0, 0, 0, 0.5)`)
- Corner brackets on panel, toolbar, and popup floats. Chrome radius is 0
- IBM Plex Mono for labels, section headers, tabs, and switches. Body text stays system-ui
- Square hits. No pill trays, no underline tab indicators, no section count badges
- Saturated color stays on canvas data (landmarks, genes, categories)
- Canvas ground follows the image. Black while an image layer is visible, neutral grey otherwise
- Left dock sections open independently. The right dock is tabs. Minimise folds bodies to headers

## Colors

Chrome is a grey veil plus one gold. Data owns saturation on the canvas.

### Primary

- **Instrument Gold** (`#edb54a`): `--tact-mark`, and `--tact-accent` aliases it. Active toolbar hits, highlighted menu and combobox rows, the on half of `.tact-switch`, the slider range and thumb, and the selected tab fill. Ink on the fill is **Active Ink** (`#111111`), `--tact-accent-ink` and `--tact-on`.

### Neutral

Light is the unmarked mode in `tactical.css`. Dark reassigns the same names.

- **Veil Ink** (`#1a1a1a` light, `#f2f2f2` dark): `--tact-ink`. Body color, `--foreground`, `--lm-text`, and `--primary`.
- **Veil Muted** (`#3a3a3a` light, `#d0d0d0` dark): `--tact-muted`. Labels, idle tabs, and `--muted-foreground`.
- **Veil Tone** (`rgba(26, 26, 26, 0.1)` light, `rgba(242, 242, 242, 0.16)` dark): `--tact-tone`. Hover hits, open layer rows, and the shaded band.
- **Veil Surface** (`rgb(214 214 214 / 97%)` light, `rgb(0 0 0 / 65%)` dark): `--tact-surface` and `--tact-veil`. Float fill and `--popover`. The light surface comment in `tactical.css` states that `#d6d6d6` at 97% composites to `#d7d7d7` on white, with ink at 12.09:1 and muted at 7.90:1.
- **Veil Edge** (`rgba(26, 26, 26, 0.14)` light, `rgba(255, 255, 255, 0.14)` dark): `--tact-edge`. The 1px float border.
- **Bracket Rule** (`rgba(26, 26, 26, 0.78)` light, `rgba(242, 242, 242, 0.78)` dark): `--tact-rule`. Corner strokes and the hotkey chip border. `--lm-sub-rule` mixes this rule at 40% with transparent.
- **Track** (`rgba(26, 26, 26, 0.28)` light, `rgba(242, 242, 242, 0.28)` dark): `--tact-track`. Slider track, tick marks, and the load-card progress track.
- **Range** (`rgba(26, 26, 26, 0.62)` light, `rgba(242, 242, 242, 0.62)` dark): `--tact-range`. Disabled slider range.
- **Destructive** (`oklch(0.577 0.245 27.325)` light, `oklch(0.704 0.191 22.216)` dark): error text and invalid input inset. Declared on `.milume-widget` in `globals.css`. Tactical does not restyle it.

`--primary-foreground` is `#f2f2f2` in light and `#141414` in dark. `--border` is transparent on the widget. Focus uses `--tact-ink`.

### Canvas

Landmark cyan, magenta, and lime (and amber, violet, and mint) are for annotations only. Categorical points use matplotlib tab pools sized to the category count (tab10, tab20, tab20+b, tab20+b+c) and avoid that neon triad. Multi-gene and embedding use additive magenta, lime, and azure on the first three channels. Continuous single-gene coloring defaults to warm cream (`#f3e6d4`) toward magenta (`#ff0099`). Points and bins share observation signals. Composition bins use majority cell-type colors from the point palette. Similarity scrubbing uses blue, then light, then magenta. Selections stay neutral greys (`#a3a3a3`, `#8a8a8a`, `#737373`, `#c4c4c4` in `SELECTION_COLORS`). Neighborhood wash is `#b3f2e8` in light. La Jolla anchors are `#191900` and `#fffecb`.

**Engine literals (not chrome).** These hex values are intentional data ramps, not veil drift. They live in `helpers.ts`, engine tables, or static JS and may appear in CSS gradients:

- **Probe / similarity legend (Crameri lajolla):** `#191900`, `#372411`, `#67342a`, `#a64644`, `#d9604e`, `#e58751`, `#ecac54`, `#f7d971`, `#fffecb` (`SIMILARITY_LEGEND_CSS`).
- **Selection strokes (quiet):** `#a3a3a3`, `#8a8a8a`, `#737373`, `#c4c4c4`.
- **Multi-gene additive channels:** `#ff0099`, `#5cbf00`, `#0088cc` (`GENE_COLORS`).
- **Cube depth highlight neutral:** `#737373` (`cube-highlight.ts`).

**Dev harness only.** `frontend/dev/design-system` gallery fixtures may use saturated demo accents (`#3d7dff`, `#ff8a00`, `#ff3b3b`) to stress-test layer swatches. Those colors are not part of the shipped Landmarks chrome palette.

### Plot ground

- No image visible. `--lm-bg` follows `.milume-widget` `--background` (`#e8e8e8` light, `#141414` dark).
- An image layer visible and loaded. The plot clears to `--lm-plot-bg-image` (`#000000`, both themes), so the image rectangle has no seam against the canvas. Only the plot stack swaps (`--lm-plot-bg`). Halos and chip fills keep `--lm-bg`.

### Named Rules

**The Image Sets the Ground Rule.** When an image is shown the canvas matches the image's black. Chrome never draws a grey frame around tissue.

**The Data Owns Saturation Rule.** Neon hues appear on canvas entities and layer swatches. Panel fills stay the veil grey. Gold is the only chromatic chrome color.

**The Scoped Widget Rule.** Never set `:root` theme tokens globally. Tokens live under `.milume-widget` and `[data-milume-portal]`, including the dark ancestor selectors in `tactical.css`.

**The Gold Marks State Rule.** Active, selected, and checked chrome use `--tact-accent` with `--tact-accent-ink`. Hover on an active hit keeps that pair. There is no side bar and no underline.

## Typography

**Body font:** system-ui, with the `-apple-system`, `BlinkMacSystemFont`, and `sans-serif` fallbacks. `.landmarks` sets this stack.

**Label font:** IBM Plex Mono, with `ui-monospace` and `monospace` fallbacks. The file is `frontend/src/styles/fonts/ibm-plex-mono-latin-400-normal.woff2` (OFL, latin, weight 400 only). `--tact-mono` names that stack.

**Character:** Body text is the notebook UI face. Instrument text is mono, small, and either uppercase or small-caps.

### Hierarchy

- **Body** (400, 0.875rem, line-height 1.4): widget copy that tactical does not retarget.
- **Section header** (400, 12px, letter-spacing 0.12em, uppercase): `.landmarks-panel-section-header__label`. A closed header main is ink at 45%. An open header main is full `--tact-ink`. Layer row names use `.landmarks-layer-label` at sentence case.
- **Tact label** (400, 10px, letter-spacing 0.12em, uppercase): `.tact-label`, `.landmarks-section-label`, and `.landmarks-toolbar-caption`. Color is `--tact-muted`.
- **Tab** (400, 11px, letter-spacing 0.08em, uppercase): `.tact-tab` and `.landmarks-sliding-tab`. Idle color is `--tact-muted`. Selected color is `--tact-accent-ink`.
- **Switch** (400, 10px, letter-spacing 0.14em, uppercase): `.tact-switch`. The hot label is `--tact-ink`, and `--tact-on` (`#111111`) when checked.
- **Readout** (400, 11px, letter-spacing 0.04em, tabular numerals): `.tact-readout`, color `--tact-mark`. Disabled readouts use `--tact-muted`.
- **Canvas legend** (400, 10px, line-height 1.25): `.landmarks__legend`. Color is `--lm-text`, which tactical points at `--tact-ink`. The overflow badge (`+N`) is 0.6875rem.
- **Ruler tick** (400, 9px, line-height 1): `.landmarks-ruler--x` and `.landmarks-ruler--y` only. Ticks are measurement marks. Heat-strip ticks (`[data-legend-tick]`) are 11px mono, not 9px.

### Named Rules

**The Mono Label Rule.** Instrument labels, section headers, tabs, switches, shortcuts, and readouts use IBM Plex Mono at weight 400. Do not invent a second weight. The shipped face file is 400 only.

## Layout

The shell height defaults to 550px, in a 400 to 1400 range. The plot fills the figure under floating chrome.

The Vite harness frames that default like a marimo edit-mode output cell. The mock output area uses `padding: 1rem`, `box-sizing: border-box`, and `overflow: visible` ([Cell.css](https://github.com/marimo-team/marimo/blob/a8d229e006bc96261b557c2f67341b68e6564371/frontend/src/css/app/Cell.css) `.marimo-cell.interactive .output-area` padding and width). Its width is marimo's default medium column, `--content-width-medium: 1110px` ([App.css](https://github.com/marimo-team/marimo/blob/a8d229e006bc96261b557c2f67341b68e6564371/frontend/src/css/app/App.css)), applied as a max width so a narrow window still shrinks the cell. It does not copy marimo's output `max-height: 610px`, so the shell resize handle can grow the widget during dev without a harness scrollbar.

Shared chrome scale on `.landmarks` is `--lm-space-*` (4px base), `--lm-chrome-inset` (0.5rem), `--lm-chrome-gap` (0.25rem), `--lm-chrome-band` (3.75rem), and `--lm-dock-width` (17rem, 15rem fullscreen). Tactical restates the dock width, the 10px panel inset, and the 10px panel pad on `.milume-widget`.

The tool cluster (`landmarks__chrome-tools`) reserves the top band and stays centered. Docks start below that band plus the gap. Wide layout puts Layers (Selections, Landmarks) on the left and Explore (View, Color by) plus Info on the right (`landmarks__chrome-dock--*`). Max-height accounts for the band. Narrow (`landmarks--narrow`, width under 640px) stacks Info, then Explore, then Layers in one top-left dock. There is no side rail, right dock, or minimap. On the narrow stack, Info is capped near 45% and Layers flex-fills and scrolls. Zoom lives in the top tool cluster (in, out, reset), not a separate bottom cluster.

**Panel budget (wide).** Fixed-size chrome. Panels do not grow with the viewport. Each dock's max height subtracts the tool band, the rulers band, and the minimap or depth rail in its corner, so no two chrome boxes overlap at 960×720, 1280×800, or 1440×900. A census of chrome boxes (tools, view cluster, docks, minimap, rail, popovers, Inspect preview) must report 0 overlaps and 0 offscreen. That census is the target for `design-scan`. It is warn-only in CI today.

### Panel grid

Both docks share one grid. Rows are `PanelRow` (`data-panel-row`). An open Layers section is a `PanelBand` with `shade`.

- Text starts at `--lm-text-start` (36px), which is `--lm-lead` (32px) plus `--lm-row-gap` (4px).
- The chevron sits in that 32px lead box (`--lm-hit-size` is 32px). Explore chevrons use the same box. `--lm-trail-hit` stays 24px for the vertical-ellipsis menu hit.
- Framed `landmarks-panel-grid` rows use flush lead (`padding-inline-start: 0`, end at `--lm-panel-pad`); body rows keep `padding-block: 0`. Open section headers share the same horizontal gutter. Section scrollports add half `--lm-panel-pad` below the list. Explore category rows use the same rule as left dock rows.
- An open group is a full-width band, not an indent. The band fill is `--tact-tone`, inset `--lm-band-inset` (4px) from the glass edge and flush with the section bottom. Only Layers shades, and only through the `shade` prop.
- The subsection line (`--lm-sub-rule`, `--lm-sub-gap` 6px) sits between groups inside that shaded section. Category labels do not get a line.
- Headers span the panel. There is no extra subheading under a group title.
- One veil surface. The scroll body is its only child.
- Corner brackets belong on the panel edge, not on a row control.
- **`landmarks-panel-grid`** wraps framed Layers `PanelBand` sections and the Explore category scroll. The bracketed section has no padding. Every `PanelRow` inside a grid shares the same horizontal gutter (0 start, `--lm-panel-pad` end). The section scrollport only adds half that below the list. Never add block padding on layer rows (`--lm-layer-row-h` is fixed). Do not tune docks separately in CSS — extend this class or its tokens instead.

### Multi-open left dock

Selections, Landmarks, and Layers open independently. Opening one never closes another. A click on an open header collapses only that section. Any subset may be open, including none. Default on first mount is all three sections open. The open set is remembered for the widget lifetime and restored when leaving minimise. It is not persisted across notebook cell remounts. Minimise still folds bodies to headers.

**Dock max-height (shipped).** Keep the existing left-dock budget, `calc(100% - var(--lm-chrome-band) - var(--lm-chrome-gap) - var(--lm-minimap-slot) - var(--lm-chrome-inset))`, plus `--lm-ruler-band` when rulers are on. Fullscreen repeats the same modifiers at higher specificity. The dock must not grow into the minimap or depth rail, and must not introduce a new height rule that drops those subtractions.

**Subpanel body cap.** Open bodies share leftover dock height after section headers (`--lm-hit-size`, 32px desktop / 44px coarse pointer). A list that fits stays at its content (`flex: 0 1 auto`). When the lists exceed the dock's max-height, lists that fit keep their content and the rest share the leftover, scrolling inside the body (`overflow-y: auto`). Each open section still keeps its header and one row. Headers stay visible. The dock itself does not scroll. A body never grows past the leftover dock.

**Overflow.** Body scrollports reuse the overlay scrollbar without a second inline inset. `overscroll-behavior: contain`. Wheel on the dock already stops at the chrome (`onWheel` stopPropagation on `.landmarks__chrome-dock`) so it never zooms the canvas. Tactical paints the landmarks scrollbar thumb with `--tact-ink`, square, 10px wide, with a 2px transparent border.

Do not apply the multi-open section rules to the right dock. The right dock is tabs, not sections.

**Explore category list.** Color-by tabs, info, and raster sit above a headerless `PanelBand` (`landmarks-panel-grid`) with the same `PanelGridScroll` / `landmarks-panel-section__scroll` contract as the left dock section bodies, so row gutters and scroll breath stay in one CSS block.

### Pseudospace grouping

The Landmarks header has a sparkle. While it is off, the section lists landmarks as usual. While it is on, a bordered pseudospace frame (accent stroke, faint accent wash, caption when non-empty) holds the ordered landmarks; the empty drop target is inset horizontally only. Ungrouped landmarks sit below a subsection rule with no extra caption. Dragging a handle into the group appends that landmark. Dropping the handle on a grouped row inserts it there. Dragging a grouped row out of the group removes it. Arrow keys on a handle reorder the group. A landmark left outside the group does not color cells. With at least two landmarks in the group, cells take a diverging ramp from the first landmark to the last. Distance is straight-line (or perpendicular-to-segment) to each landmark geometry—not a kNN graph walk. The first landmark's value is 0, and its panel row and map badge both show 1. A cell outside the span has no value and renders the neutral gray. Outside means the nearest consecutive pair is the first pair and the cell's projection parameter on that pair is t < 0 (beyond landmark 0), or the pair is the last pair and t > 1 (beyond landmark n-1). t is 0 at the closest point on the earlier geometry and 1 at the closest point on the later one, so a line or polygon uses the same test as two points. A cell on an interior pair, including one beside an interior landmark and off the chain axis, keeps `pairIndex + d0/(d0+d1)`. The ramp, the neutral gray, and the badge ink are `PSEUDOSPACE_COLORS` in `milume/static/pseudospace-colors.js`. The ramp runs red `[165, 15, 21]`, orange `[252, 141, 89]`, white `[247, 247, 247]`, light blue `[107, 174, 214]`, then blue-purple `[84, 39, 136]`. A cell with no finite pair stays neutral gray, `[138, 138, 138]` on a dark page and `[92, 92, 92]` on a light page. The map badge is white ink on `[20, 20, 20, 220]`.

- **Data card legend and summary bar (target).** While a category legend is open, the donut becomes a summary bar. The summary line ("358,173 cells · 21 categories") sits over a 24px stacked bar with the donut's slices in the same order, colours, and proportions, separated by 1px gaps. Both are pinned above the legend. The chevron brings the full donut back. Fallback: keep the bar while the legend still shows at least min(8, categories) entries under the filter, with the rest scrolling inside the card. Otherwise drop the bar and keep only the summary line. Measured: the bar stays at 1280×800 (18 of 21 visible) and 960×720 (14 of 21), and falls back at 960×600 (6 is under 8). Filter stays pinned at the top. Short labels flow into two columns. Long labels show the top N by cell count plus "Show all N". The card never grows past its budget.
- **Minimise mode (target)** (`Shift+\`). Folds chrome in place. The left card keeps its width, inset, and section order. Selections and Landmarks fold to header rows (name, caret). Layers stays the third section of the same card. The right card folds to a data chip. Nothing moves to another container. Depth rail and minimap stay. State persists per user.
- **Inspect preview placement.** Never over a dock, dock toggle, minimap, tool cluster, view cluster, context bar, or depth rail (8px margin), and never within 24px of the cursor. The nearest free spot to the cursor wins. Shrink (480, then 360, then 280) before overlapping anything.
- Inspect collapses both side docks. Peek tabs stay. Leaving Inspect restores the docks.
- Inspect is a temporary mode with its own chrome. The Inspect pill takes the tool cluster's slot. The Inspect bar sits at the bottom centre.
- Inspect cube. An immersive takeover of the plot area, not a floating window. `role="dialog"` "Cube" fills the plot area (`z-index` 21, under the top cluster at 22) and has no chrome of its own. Save and Exit live on the Inspect pill. The view options live on the Inspect bar. Corners match `.landmarks__body` (0 radius, including fullscreen). While it is open (`.landmarks--cube-open`) the docks and peek tabs float over it at `z-index` 22, so a category or Selection can still be focused to colour it and a saved window reopened from its row. Leaving Inspect closes it. It fades and scales in from the viewport centre (`--duration-quick`). Under `prefers-reduced-motion` that animation does not run.

## Accessibility

**Operate target:** WCAG 2.1 AA on chrome. The scatter plot is pointer-primary for draw and pan gestures.

**Hits.** Desktop chrome uses `--lm-hit-size: 32px`. Coarse pointers (`@media (pointer: coarse)`) bump `--lm-hit-size` to 44px on `.milume-widget` and `[data-milume-portal]`. Context menu rows (`.tact-menu-item`, `[data-slot="dropdown-menu-item"]`) get `min-height: 44px` under the same query.

**Shell resize.** `.landmarks__resize` keeps a 4px pill (`::after`) centered in a 72×44px button with `touch-action: none`. Focus uses the same ring as `.landmarks-hit`. `--lm-resize-band` reserves space above the handle for minimap and depth rail.

**Keyboard.** Dock collapse (`[` / `]`), minimise (`Shift+\`), toolbar radios, tabs, switches, sliders, menus, Inspect exit, and pseudospace reorder handles are keyboard-operable. Full shortcut inventory lives in `PRODUCT.md` (Accessibility & Inclusion).

**Motion.** `MotionConfig reducedMotion="user"` wraps the widget. Inspect cube entrance respects `prefers-reduced-motion`.

**Canvas gaps.** Region drawing and map navigation still require pointer input on the plot; document that boundary in product copy rather than implying full keyboard parity on the deck.gl surface.

## Elevation & Depth

Floating chrome is a veil, not a bare shadow and not a rounded glass card. `.landmarks-float--panel`, `.landmarks-float--toolbar`, and `.tact-popup` set radius 0, fill `--tact-veil`, blur `--tact-blur` (`blur(4px)`), border `1px solid var(--tact-edge)`, and shadow `--tact-lift`. Eight linear-gradient strokes, each 10px by 1px, sit at the four corners and do not repeat.

Tactical then points `--lm-float-bg`, `--lm-float-blur`, and `--lm-float-shadow` at those same tokens on `.milume-widget.landmarks`. `--lm-float-radius` is 0. The base `landmarks.css` shadow and 10px blur do not win on these floats.

### Shadow vocabulary

- **Lift** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5)`): panels, toolbars, popups, menus, and card-slot floats.
- **Plot body** (`0 1px 2px` at 6% black, plus `0 8px 24px` at 8% black): `.landmarks__body` only. The plot canvas itself stays flat.
- **Tooltip** (`box-shadow: none`): `.tact-tooltip` and `.landmarks-tooltip`. Square, veil fill, 4px blur, transparent border. The arrow is `display: none`.

### Named Rules

**The Bracket Rule.** Depth on a top-level float is the veil fill, the 4px blur, the 1px edge, the lift shadow, and the corner rule lines together. A shadow alone is not the float. Brackets stay on the panel edge.

**The Flat Plot Rule.** Scatter and image canvases do not take a drop shadow. The widget body may.

Menus keep the 1px edge and the lift shadow, and they do not draw corner brackets. The Inspect pill keeps a 1px dashed outline (`landmarks.css`, higher specificity than the tactical toolbar border) so a temporary mode still reads as a mode.

## Shapes

Chrome radius is 0. Tactical sets `--lm-float-radius`, `--lm-hit-radius`, and `--lm-layer-radius` to 0, and it forces 0 radius on floats, hits, tabs, menus, tooltips, inputs, chips, swatches, thumbs, and the load card.

`.landmarks__body` is also 0, including fullscreen. The in-plot legend and its bar are 0. `.milume-widget` still declares `--radius: 0.35rem` in `globals.css` for any control tactical does not override.

Corner brackets are the recurring silhouette. They are eight background layers, not a clip path and not a border-image. Swatches that tactical paints (channel dots, header swatches) are squares, 10px or 14px, not circles.

### Named Rules

**The Square Chrome Rule.** Hits, tabs, switches, menus, and docks are rectangles with 0 radius. Do not put a pill radius on a toolbar or a mode hit.

## Components

Shipped chrome uses Base UI (`@base-ui/react`), shadcn components generated for Base UI, Tailwind 4, and Motion. Landmarks buttons are square hits. Icon hits are `button-hit` (`chromeHitClass`, 2rem square, no padding, 0 radius). Text hits are 2rem tall with 0.625rem inline padding for Reset and Save window. The design-system page mounts each shipped component once. Hover, focus, open, and disabled happen on that instance. `:focus-visible` inside `.milume-widget` is a 1px `--tact-ink` outline, offset 3px.

### Toolbar hits

- **Shape:** square (0 radius).
- **Default:** transparent fill, `--tact-ink` glyph.
- **Hover:** `--tact-tone` fill and `--tact-ink` glyph, except the minimise toggle.
- **On:** `--tact-accent` fill and `--tact-accent-ink` glyph. Selectors are `aria-pressed="true"`, `data-state="on"`, `data-pressed`, `aria-checked="true"`, and `.landmarks-hit--on`. Hover keeps the gold. No box-shadow.
- **Minimise toggle exception:** pressed state keeps `--lm-hit-bg` and `--foreground`, not gold.

### Tabs

`.tact-tabs` and `.landmarks-sliding-tabs` are a single row, 32px tall, transparent, 0 radius. Each tab is 28px, 11px mono, uppercase. The selected tab is a square gold block (`.landmarks-sliding-tabs__pill`, `--tact-accent`, 0 radius) with `--tact-accent-ink` type. There is no underline and no line indicator.

### Switch

`.tact-switch` is a 4.75rem by 22px grid with two equal columns. `.tact-switch--sm` is 4.25rem by 20px. The glide is a span covering the hot half. When the switch is checked, the glide is `--tact-mark` and the hot label is `#111111`. When it is not checked, the glide is transparent.

### Menu item

`.tact-menu` is a column, 2px gap, at least 13rem wide, padding 8px 6px. A `.tact-menu-item` is square and transparent. Highlighted, focused, or checked, the row fills `--tact-accent` with `--tact-accent-ink` and no shadow. Combobox items and channel-color options use the same pair. Destructive items use `--destructive` and a 10px top margin.

### Section header

The label is `.landmarks-panel-section-header__label` (12px mono, small-caps, 0.14em). The lead is the chevron hit. The trail is actions, not a count badge. A row menu is `.landmarks-trail-hit` (24px, `--tact-tone` fill, 0 radius) with a vertical ellipsis.

### Slider

`.tact-slider` is 24px tall. The track is a 1px `--tact-track` line. `::after` draws five tick marks (6px at the ends, 4px at 25%, 50%, and 75%). The range is `--tact-mark`. The thumb is a 1px by 13px gold mark, with a larger hit box (`inset: -4px -10px`). End labels are 10px mono in `--tact-muted`. Disabled thumbs use `--tact-muted` and the range uses `--tact-range`.

Scalar, dual, and signed rows are `TactCapsuleSlider`, `TactSliderRow`, and `TactSignedSlider`. `TactSliderReset` is the Lucide `rotate-ccw` control, immediately right of the row when needed.

### Tool cluster

Icon-only select and landmark mode groups, zoom (in, out, reset), and fullscreen. Class `landmarks-float landmarks-float--toolbar`. Active state is the gold hit above, not a foreground-filled glyph.

### Inspect chrome

Inspect is temporary, so its chrome replaces the normal chrome rather than adding to it.

- **Inspect pill** (`chrome/inspect-pill.tsx`, `InspectPill`). Takes the tool cluster's top-centre slot while `mode` is Inspect. The two swap with `Rise` from `src/components/ui/rise.tsx` on `SPRING_GLIDE` (the leaving one is `inert`, no clicks). Focus follows the swap. The tool cluster does not rise on first mount. Same toolbar veil, plus a 1px dashed outline (`.landmarks-toolbar.landmarks__inspect-pill`, muted text at 70%). Armed: Exit Inspect, a box icon and "Inspect", the hint "Click to place", zoom in / out / reset (`ZoomControls`), and full screen. Open: close, "Inspect · {n} µm", a status chip, Save window (BookmarkPlus to BookmarkCheck "Saved", disabled), and full screen. Labels are 0.75rem. Meta uses `--lm-text-muted`.
- **Status chip** (`landmarks__inspect-status`, 0.6875rem, muted, `data-testid="inspect-status"`, `role="status"`). Mounted for the whole open session, `data-state` of the load. "Refining" with a gradient band sweeping the text (`landmarks-shimmer`, 1.4s linear, on `.landmarks__shimmer`). At `data-state="ready"` the chip has no text and uses `sr-only` so it stays in the tree off the flex row. An error uses `text-destructive`, max 14rem (8rem narrow), with an ellipsis and the full text in `title`. No sweep under `prefers-reduced-motion`.
- **Inspect bar** (`chrome/inspect-toolbar.tsx`, bottom centre, toolbar veil). `Top | Iso | Side` toggle group, a divider, Move (hand, on means pressed, grab cursor in the cube), Reset view, a divider, Adjust, and Cross-section.
- **Bar panels** (`ToolStack`, one open at a time, rising right-aligned above their button). Toolbar veil, capped at `min(45cqh, 22rem)` against the widget box (`.landmarks__chrome` is a size container) and scrolling inside (`overscroll-behavior: contain`). While a slider is dragged (`data-tuning="true"` on the panel), that panel fades to opacity 0.32 over 120ms so the cube under it stays readable, and returns on release. Show, Mode, Palette, and Reset do not fade it. Adjust is two columns, Image and Labels, each a titled section with its Show switch beside the title and a ghost "Reset" on the right. Rows use the tact slider. Non-slider controls (Mode toggle, Palette swatch dropdown) share that width. "Reset all" sits at the foot. Below 640px the columns stack. Cross-section is one section, with X, Y, and Z range sliders and Reset. The same cuts are the volume's faces. Each grabbable face (normal in the screen) is an axis-coloured plate, X red, Y green, Z blue, including while the cut is still the open window. Near (about 40px) and hover strengthen the plate and show the drag direction. A press on the plate cuts along its normal and commits on release. Orbit stays everywhere that is not a grabbable face. An inset cut keeps the white box, and the plates ride it. Tissue outside the cut stays in the window at low opacity.
- **Selections rows and hover card.** An inspect entry's row shows its cube thumbnail (the 64×40 snapshot cropped into a square, `.landmarks-layer-thumb`, 0 radius, edged in the selection colour) where other rows have the swatch. Every selection row opens a `HoverCard` to its right (`.landmarks__selection-card`, 14rem, tactical panel, portalled to the widget root, no entrance under reduced motion). The card shows the thumbnail (full width, 64/40), the name, "N cells", the window or extent in `landmarks-meta`, then three category bars (label, track at foreground 10%, percent) filled in the category colours.

### Docks

`landmarks-float landmarks-float--panel` on Card. Layers holds Selections and Landmarks. Explore holds Color by (category, genes, embedding) and similarity when the view is raster. Info holds selection-linked composition and gene densities. The View control (`ViewCta`) sits top-right. At rest it shows the current Points or Raster mode. Hover reveals the destination icon. Click commits. View is not nested in Explore. Explore shows Color by only. The similarity scale appears only for bins. Status copy appears only while computing, on error, or when pinned. The color-by meta line appears only for genes and embedding.

### Fields

Inputs (`[data-slot="input"]`) are 28px tall, 0 radius, no border on the widget rule that follows the portal rule, fill `--tact-tone`, 12px mono, `--tact-ink`. Invalid inputs get `inset 0 0 0 1px var(--destructive)`. Disabled inputs use `--tact-muted` at opacity 0.45. The portal input rule still draws `1px solid var(--tact-track)`. The widget rule wins inside `.milume-widget`.

### Panel controls

- **Hide a dock.** A plain caret pointing where the panel goes. It flips on the edge tab once hidden.
- **Folded section rows in minimise mode.** A caret when folded, an open chevron when open. The data chip uses the open chevron.
- **Minimise toggle.** Square-outlined minus or plus (Lucide `SquareMinus` / `SquarePlus`, 16px, 2px stroke), last button of the top-right view cluster in both modes. The square keeps it distinct from zoom. Tooltip "Minimize panels" and "Show panels" with `Shift+\`, opening left of the cluster.
- No overflow icon in minimise mode. Row menus elsewhere use the vertical ellipsis trail hit.

### Summary bar (target)

One element painted with a hard-stop `linear-gradient` (one stop pair per slice, 1px separator in the card at 70%), 24px tall, 0 radius to match `.landmarks__legend-bar`, `role="img"`, `aria-label="Cell type composition"`. Not one child per slice. The active category's slice should mark itself the way the donut's active slice does. **Planned, not shipped** (a CSS stub exists, no rendered bar yet). Segment order and colours come from the same slice list as the donut.

### Inspect preview

Shows the image window only. Inspect never draws points.

### Narrow stack

Below 640px, Info (capped), then Layers (flex-fill and scroll), share one top-left dock.

### Chrome tokens

One set for the tool cluster, View control, context levels, Inspect pill, Inspect bar, and peek tabs. Class constants live in `chrome/primitives.tsx`. Tactical overrides the on-state and the float material.

| Role | Class | Tokens |
| --- | --- | --- |
| Toolbar surface | `landmarks-float--toolbar` | height 2.5rem, pad and gap 0.25rem, veil plus brackets |
| Icon hit | `landmarks-hit` | 2rem, radius 0, hover `--tact-tone` |
| On state | pressed, on, or checked | fill `--tact-accent`, ink `--tact-accent-ink` |
| Trail hit | `landmarks-trail-hit` | 24px, `--tact-tone`, vertical ellipsis |
| Slider | `tact-slider` | 1px track, tick marks, gold thumb and range |
| Section label | `landmarks-panel-section-header__label` | 12px mono small-caps, no count |

### Motion

Springs live in `src/lib/motion-springs.ts`. Duration tokens live on `.landmarks` in `landmarks.css`. `motion/react` runs only inside `src/components/ui`.

Numbers in the spring column are stiffness, damping, and mass. `SPRING_GLIDE` sets no mass.

| Token | Spring | Use |
| --- | --- | --- |
| `SPRING_PRESS` | 500 / 30 / 0.6 | Chevron and press |
| `SPRING_PANEL` | 420 / 40 / 0.5 | Defined in `src/lib/motion-springs.ts`. Unused by `SpringPanel` |
| `SPRING_LAYOUT` | 360 / 32 / 0.6 | Group height and band tone |
| `SPRING_GLIDE` | 280 / 32 | Popup rise, switch, and tonal block |

| Token | Duration |
| --- | --- |
| `--duration-stagger` | 40ms |
| `--duration-micro` | 80ms |
| `--duration-quick` | 150ms |
| `--duration-fast` | 250ms |
| `--duration-medium` | 350ms |
| `--duration-slow` | 400ms |
| `--duration-very-slow` | 500ms |

Panel groups follow `GroupBody` and `GroupChevron` in `src/components/ui`.

- Height and band tone use `SPRING_LAYOUT`.
- The chevron uses `SPRING_PRESS`.
- Rows fade and rise 8px on `SPRING_GLIDE`.
- The first row starts at 40ms. Later rows follow 40ms apart (`--duration-stagger`).
- Close reverses the same timing.

Reduced motion is one rule. Height, `x`, `y`, scale, and rotate snap. Opacity may fade up to 80ms (`--duration-micro`). `MotionConfig` at the widget root sets `reducedMotion` to `user`. One CSS block covers `prefers-reduced-motion`.

`motion/react` stays inside `src/components/ui` so `check-chrome` can see it. `stabilizeUi` sets `MotionGlobalConfig.skipAnimations`.

## Do's and Don'ts

### Do:

- **Do** scope tokens under `.milume-widget` and `[data-milume-portal]`, and follow notebook light and dark ancestors.
- **Do** paint floating chrome with `--tact-surface`, `blur(4px)`, `--tact-edge`, `--tact-lift`, and the 10px corner brackets.
- **Do** mark active hits, highlighted menu rows, and the checked switch with `#edb54a` and `#111111` ink.
- **Do** set instrument labels, section headers, tabs, and switches in IBM Plex Mono at the sizes in Typography.
- **Do** keep docks at `--lm-dock-width` (17rem) and scroll inside panels.
- **Do** keep section headers free of count badges, and put row actions on the 24px vertical-ellipsis trail hit.
- **Do** clear the plot to black while an image layer is visible.
- **Do** keep chrome box overlap at zero at 960×720 and 1280×800.
- **Do** keep the summary bar above an open legend while at least 8 entries still fit. Otherwise show the one-line summary.
- **Do** keep chrome text at 10px or larger, except canvas ruler ticks at 9px.

### Don't:

- **Don't** use rounded pills, sliding underline indicators, or foreground-filled active glyphs.
- **Don't** put a count badge in a section header.
- **Don't** set global `:root` or `body` colors from widget CSS.
- **Don't** apply drop shadows to the plot canvas.
- **Don't** hand-roll a button or input when a shadcn component exists.
- **Don't** invent a second float material. Use `landmarks-float` and let tactical.css supply the veil.
- **Don't** move a control between containers when entering minimise mode.
- **Don't** close one left-dock section because another opened.
- **Don't** draw points in the Inspect preview or cube.
- **Don't** use Unicode glyphs as icons. Carets, boxes, and the vertical ellipsis come from Lucide.
