# Inspect rework: pan the window, shell labels, swapped Inspect chrome, selection info

Status: approved in brainstorming (2026-10-03), from review comments on PR
[ckmah/milume#58](https://github.com/ckmah/milume/pull/58). Reworks the immersive
cube of [`2026-10-02-inspect-immersive-cube-design.md`](2026-10-02-inspect-immersive-cube-design.md)
on the same branch and PR. Builds on [ADR 0006](../../adr/0006-landmarks-hosts-volume-cube.md).

## Goal

Make Inspect a temporary, self-contained mode: the top toolbar swaps to an Inspect
toolbar, the cube lets the user move the 300 µm window in XY, labels read as
shells, the controls are organised by what they affect, and saved inspect
windows are described in the Selections panel instead of a separate strip.

## Non-goals

- No new synced traits (ADR 0005/0006). Pan writes the existing `inspect_cx` /
  `inspect_cy`; all new state is client-local.
- The 300 µm window stays fixed. The cube never shows more than the window.
- No change to Inspect selections' persistence (`type: "inspect"`,
  `point_indices`, `window: { cx, cy, size_um, cut }`).
- Out of scope, separate specs and PRs: the minimap density heatmap, and the
  embedding info panel showing all cells.

## 1. Remove the context layer

The context region added in PR #58 gave no functional value. Delete: the second
`useShownWindow` and the `contextLayer` in `VolumeCube.tsx`, `context-layer.ts`,
`FramedVolumeView`'s context branch, the `ctxOn/ctxWin/ctxLook` uniforms and
`ctxHidesRay/ctxGrade` in `cell-lut-extension.ts`, `CONTEXT_DIM/DESATURATE`,
the `context` prop and its `zoomOut` camera floor, `data-context*` attributes,
the context e2e tests, and their feature-map / ADR / spec lines.

Kept from PR #58: open on release, the immersive takeover, docks and peek tabs
floating over the open cube, leaving Inspect closing the cube, the live-window
thumbnail snapshot (reused in section 6).

## 2. Pan the active window in XY

- **Inputs.** Plain drag still orbits. **Shift+drag** pans. The **Move** tool
  (hand button in the bottom bar, client-local `move` flag) makes plain drag pan,
  with a grab cursor; clicking it again, or leaving the cube, turns it off.
- **What moves.** The live inspect window: `inspect_cx` / `inspect_cy` update
  (written at most every 40 ms and once on release, the same rule as the old map
  drag), the map's square follows (`engine.setInspectWindow`), Save captures the
  panned position. Saved entries stay fixed snapshots; a pan moves only the live
  window. The window is clamped to the volume's XY extent.
- **Mapping.** A pointer delta in px converts to µm on the XY plane through the
  window centre using the deck viewport, so it is correct top-down and orbited.
- **Controller.** The orbit controller must not also act on a pan drag: the cube
  host handles pointer events in the capture phase while Shift is held or Move is
  on and disables the controller's rotate for that gesture. Pan never drifts the
  camera target (`fixedTargetRef` stays).
- **Data.** The window moves; the loaded tissue slides under the frame (`data-pan`),
  then the fine level swaps in: the existing debounce / refetch / pan machinery.
  The X/Y cut stays window-relative and settles as before (`use-inspect-cube.ts`).
  Wheel zoom is unchanged.

## 3. Labels as shells

Remove the interior fill: every cell is a thin shell (surface voxels only).

- Highlighted cells (focused category or Selection): shell in the category colour,
  about 0.9 alpha (the existing highlighted-surface branch of `cellColor`).
- All other cells: the orange shell, alpha retuned lower for dense tissue.
- In `cell-lut-extension.ts`: interior (`!surface`) cells draw nothing;
  retune `OUTLINE.alpha` / `OUTLINE.behindHighlight` and `DEFAULT_RENDER.cellAlpha`.
  Calibrate by eye on the toy volume and the colon A2 section; the Adjust
  Label alpha slider stays.

## 4. Inspect toolbar (top pill swap)

**What the normal top pill offers vs Inspect.** Tool switches (select, hand,
landmark, lasso, colour) are not needed: switching tool already leaves Inspect.
Map zoom and reset are needed while placing a window; fullscreen is always
useful; a way out of the mode is new.

**Swap.** Entering Inspect (`I` or the cube icon) swaps the top pill for the
Inspect pill, and leaving swaps it back, with the existing Rise/Morph motion
primitives (instant under `prefers-reduced-motion`). The Inspect pill has a
**dotted outline** so the temporary mode reads at a glance. Two states:

- **Armed (no cube):** `× Exit` · **Inspect** · hint "Click to place a 300 µm window"
  | map zoom −/+ · reset zoom · fullscreen.
- **Cube open:** `× Exit` · **Inspect · 300 µm** · status | **Save** | fullscreen.

`×` leaves Inspect entirely (closing the cube) and restores the normal pill. Esc
keeps its meaning (close the cube, stay armed); a second Esc with no cube open
exits Inspect.

**Status chip.** Shimmering text **Refining** (a CSS gradient sweep across the
text) that resolves to **Ready** through a short crossfade, then rests as muted
text. Error state shows the message. No shimmer under reduced motion. The chip
carries `data-state="refining|ready|error"` so tests do not depend on animation.

The old top-right Cube·µm / Save / Close pill is deleted.

## 5. Bottom bar and panels (cube open)

**Bottom bar:** `Top | Iso | Side` · **Move** · Reset view · **Adjust** ·
**Cross-section**. Nothing else.

**Adjust panel**, two columns **Image | Labels**, each with a show switch, its own
projection **Additive | MIP**, and its own Reset; "Reset all" at the foot.
- Image: Palette (moved out of the bar), Contrast, Alpha, Gamma.
- Labels: Alpha.

**Cross-section panel** (renamed from "Cuts", own button): X, Y, Z range sliders,
Reset.

**Panel height.** Both rise above the bar with `max-height` about 45% of the
widget height, scroll inside, so they never take over the canvas. On narrow
widgets Image and Labels stack and scroll.

**Independent projection per layer.** One extension with `imageMip` / `cellMip`
uniforms replaces the two per-mode extension classes (and avoids a recompile on a
toggle). Image Additive accumulates samples, image MIP takes the maximum. Labels
Additive accumulates shells front to back (translucent stack), labels MIP takes the
single strongest shell along the ray. Labels composite over the image in every
combination. `CubeSettings.mode` is replaced by `imageMode` and `labelMode`.

## 6. Selections replace the history strip

- The cube's history chips are removed. Inspect entries appear in the left
  Selections panel (which floats over the cube). A row click restores the window
  and cut and opens the cube (the existing focus-restore path).
- **Concise names**, generated at creation from what the selection holds:
  `<top category> · <cell count>` using the active Color-by categorical, e.g.
  `Epithelial · 214`. With no categorical, inspect entries read `Inspect <n>` and
  other types keep their current default. Duplicates get a numeric suffix. The name
  is a plain string in `id`, so rename still works, and it is static; the hover card
  below is live.
- **Hover card** (new shadcn `hover-card`, via `npx shadcn add`) on any selection
  row, computed on hover only:
  - Inspect: cube thumbnail (larger than the old chip), window size and centre,
    cut summary, cell count, top-3 category bars from the live Color-by.
  - Other types: cell count, bounds in µm, the same category bars.
- **Thumbnails.** The live-window snapshot machinery (live slot, `windowKey`, a
  widget-local `Map`, never synced) feeds the row thumbnail and the card.
  Selections without a snapshot (from Python or a reloaded session) show the colour
  swatch and the hover info without an image.

## State and traits

Client-local `CubeSettings` gains `move`, `imageMode`, `labelMode` and loses `mode`.
No new synced traits. Python-visible behaviour: `inspect_cx` / `inspect_cy` also
move during a pan (they already move during a map drag).

## Testing

New or rewritten Playwright tests (`frontend/e2e/landmarks/landmarks-volume.spec.ts`):

- Shift+drag in the cube moves `inspect_cx`/`inspect_cy`, the map square follows,
  the cube settles at the new window; Move tool toggles the same; plain drag orbits
  and does not move the window; the window clamps at the volume edge.
- Entering Inspect swaps the top pill (dotted Inspect pill present, normal pill
  gone); `×` restores it and closes the cube; Esc then Esc exits.
- Status chip `data-state` goes `refining` → `ready`.
- Adjust: Image and Labels projection toggle independently (data attributes);
  palette in Adjust; Cross-section panel has the X/Y/Z sliders; panels stay under
  the max height at a short widget.
- Labels render as shells: no filled interior (pixel check on a highlighted cell).
- Selections: no history strip; row shows thumbnail and concise name; hover card
  shows count and category bars; clicking a row restores and opens the cube.
- Update the verify-landmarks feature maps (`inspect-cube.md`, `inspect-history.md`,
  `toolbar-layout.md`, `zoom-controls.md` as touched), ADR 0006 addendum, and
  `frontend/DESIGN.md`.
- Gate: `npm run test:e2e:landmarks`, `npm run test:e2e:core` (shared chrome
  touched by the shadcn hover-card), typecheck, build, and a check in the colon A2
  notebook.

## Risks

- **Shift+drag vs the orbit controller.** deck's OrbitController has its own
  modifier handling. The plan must verify how it treats Shift and intercept the
  gesture rather than assume it is free.
- **Panning perf on large sections.** Each move refetches a 300 µm window; rely on
  the existing debounce, chunk cache and coarse-first step, and measure on colon A2.
- **Independent projection shader.** Two accumulators and four combinations in one
  loop; verify all four visually and that the window layer's cost does not rise.
- **Swapped top pill** touches the shared Topbar and the Inspect radio that existing
  tests and `toolbar-layout.md` assume; adapt rather than delete those tests.
- **Name generation** depends on the active categorical at creation time and on
  Python-created selections having no snapshot.
