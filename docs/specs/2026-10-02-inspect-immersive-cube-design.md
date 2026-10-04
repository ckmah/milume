# Inspect: immersive cube

> **Superseded in part (2026-10-03):** the context region (coarse, dimmed context
> layer around the window) and its zoom-out bound were removed; see
> [`2026-10-03-inspect-rework-design.md`](2026-10-03-inspect-rework-design.md).

Status: approved in brainstorming (2026-10-02). Builds on
[ADR 0006](../../adr/0006-landmarks-hosts-volume-cube.md) and
[`2026-09-26-inspect-preview-dock-design.md`](2026-09-26-inspect-preview-dock-design.md).

## Goal

A click in Inspect takes the cube over the widget's plot area instead of opening
a small floating window. The user sees the 300 µm window filling the viewport,
and can zoom and pan out to the tissue around it. The window stays the unit
that Save, the cut and the highlight act on; the surroundings are context only.

## Non-goals

- No free-roam: panning the cube never moves `inspect_cx` / `inspect_cy`.
- No new synced traits (ADR 0005, ADR 0006): `volume`, `volume_label_ids`,
  `volume_cut`, `inspect_*` and `selections` keep their meaning.
- No browser-native fullscreen on click. The existing fullscreen button still
  works on top of the takeover and gives it more room.
- No floating, draggable or resizable cube window. It is removed, not kept
  behind a toggle.

## Interaction

**Open.** Click places the window (unchanged) and the cube fills the plot area
(`.landmarks__body`) of the widget at its current size, or the whole widget in
fullscreen. The map stays mounted underneath, hidden, so the engine keeps its
layout and WebGL context. The cube grows from the hover preview's rect in
~150–200 ms (`cube-motion` primitives; instant under `prefers-reduced-motion`).

**While open.** The hover preview is suppressed. Camera opens top-down with the
window framed to fill the viewport. Zoom and pan are allowed out to the loaded
region (~3× the window). Esc or the Close button returns to the map (Esc is
already wired through `useInspectCube.onKeyDown`).

**Chrome.** Full-bleed cube; Soft Float glass chrome over it, from existing
primitives (`FLOAT_PANEL`, `chromeHitClass`):

- top centre: the existing `InspectToolbar` (Adjust: image, labels, cuts);
- top right: title (`Cube · 300 µm`, refining / error status), Save, Close;
- bottom: the inspect history strip (chips, as in the old window).

Docks stay collapsed while in Inspect (unchanged).

## Context outside the window

The window is drawn as an outline box. Tissue outside it is **defocused**, so the
window reads as the focus area:

1. **Coarse context (this change).** The region around the window loads at a
   coarse pyramid level (`pickLevel` against the preview region budget), so it is
   soft by construction and cheap. The window itself refines to the fine level
   through the existing refine path. The seam is at the window outline. A light
   desaturate / dim of outside voxels sharpens the separation.
2. **Blur pass (optional follow-up).** A screen-space blur masked by the
   window box's projected footprint, so the focus holds when the cube is
   orbited. Real depth of field does not do this job: from the top view the
   window is a lateral box, not a depth slab, so a depth-based focal plane would
   not isolate it. Ship tier 1 first; add tier 2 only if tier 1 does not read
   as focus on real data. It costs an extra full-canvas pass.

Cut sliders, highlight groups and Save act only inside the window. Cut ranges
stay window-relative (`cube-cut.ts`).

If dimming outside voxels proves to be a large shader change in
`cell-lut-extension` / `frame-layers`, fall back to outline plus coarse softness
only.

## Data

- On open: coarse region (3×, preview budget) from the shared per-widget
  `ChunkCache`, so it is mostly cache reads after hover; then the fine level for
  the window only.
- `VolumeCube` currently clips the shown volume to the requested window. It gains
  a context mode: the loaded region is drawn, the frame/outline marks the window,
  and cuts/highlight clamp to the window. The shared `VolumeCube` stays
  backward compatible (the preview and the standalone cube are unchanged).
- Camera `minZoom` / `maxZoom` and pan bounds follow the region instead of the
  window.

## Code changes

| Area | Change |
| --- | --- |
| `landmarks/chrome/cube-window.tsx` | Replace with `CubeImmersive`: fill container, no drag/resize/`clampRect`; keep title bar actions, history strip, snapshots |
| `landmarks/LandmarksView.tsx` | Render `CubeImmersive` inside the plot area stack; hide map layer and `InspectPreview` while `cube.open` |
| `volume-cube/VolumeCube.tsx` | Context mode (region drawn, window outlined, cuts clamped to window), wider zoom/pan bounds |
| `volume-cube/cell-lut-extension.ts`, `frame-layers.ts` | Outside-window dim / desaturate |
| `landmarks/landmarks.css` | `landmarks__cube-window` styles → immersive; remove resize handle styles |
| `landmarks/use-inspect-cube.ts` | Unchanged semantics; open/close wiring only |

## Testing

- `frontend/e2e/landmarks/landmarks-volume.spec.ts`: click opens a cube whose
  box matches the plot host; Esc returns the map; Save and history chip focus
  still work; zoom-out reveals context outside the window.
- Update the verify-landmarks feature map (inspect cube capability).
- Gate: `npm run test:e2e:landmarks`, plus visual evidence on the PR
  (`.github/scripts/post-playwright-visuals.sh`).
- Docs: ADR 0006 addendum; `frontend/DESIGN.md` (cube is no longer a floating
  window).

## Open risks

- Outside-window dim in the raycast shader (fallback above). Resolved, see Deviations (two-layer context, shader dim).
- Opening from a small cell: the plot area may be short; the camera fit and
  chrome must hold at the minimum widget height.
- Coarse region budget on very large sections: reuse `PREVIEW_REGION_BUDGET`
  and the `fitsBudget` / `regionBox` rules; do not add a second budget.

## Deviations during implementation

What was built differs from the plan above in these ways.

- **Opens on release, not on click.** The cube opens on mouse release (the
  engine's `release` event, commit `3be7b2c`): a press-and-drag positions the
  window with the hover preview following, and the cube opens where the drag
  ends. The map is covered while the cube is open, so to move the window the
  user presses Esc or Close, then places again. The hover preview is hidden
  while the cube is open.
- **`CubeImmersive` replaced `CubeWindow`.** `chrome/cube-immersive.tsx`
  (`role="dialog"`, name "Cube", `z-index` 21) replaced `cube-window.tsx`. Its
  actions (title, Save window, Close cube; `data-testid="cube-actions"`) sit
  on a **second row below the tool pill**, not top right on the same row, since
  the Close button was under `.landmarks__chrome-view`. The history chips are
  bottom-left (`aria-label="Inspect history"`). Snapshot helpers moved to
  `chrome/cube-snapshots.ts`, with a live-window snapshot slot so a chip gets
  its thumbnail when Save lands after the cube has settled.
- **Open animation.** A fade/scale from the viewport centre, not a grow from
  the hover preview's rect (none under `prefers-reduced-motion`).
- **Two-layer context, window layer untouched.** `VolumeCube`'s `context` prop
  loads a second coarse volume layer (a second `useShownWindow`; 3× the window,
  `PREVIEW_REGION_BUDGET`), drawn first. The shader (`ctxOn` / `ctxWin` /
  `ctxLook` in `cell-lut-extension.ts`) drops any context ray that crosses the
  window's column (an analytic slab test before the loop), using the window's
  exact µm extent, and dims (`CONTEXT_DIM`) and desaturates
  (`CONTEXT_DESATURATE`) the rest. `data-context`, `data-context-level` and
  `data-context-refining` mirror it on `.volume-cube__view`; the hover preview
  reports `data-context="off"`. With X/Y cuts the cut-away part of the window
  shows empty.
- **Compositing limit when orbited.** Because the context drops the window's
  whole column, an orbited camera shows no context tissue in front of or
  behind the window. Tier 2 (the screen-space blur) was not built.
- **No pan.** The camera has no free pan (the orbit target stays on the
  window); zoom-out stops at log2(3) + 0.25 steps below home with the context
  (2 without, as before), instead of the wider zoom and pan bounds planned.
- **Docks and peek tabs float over the open cube.** Entering Inspect still
  collapses both docks, but while the cube is open (root class
  `landmarks--cube-open`) the docks and peek tabs sit over it (`z-index` 22,
  Soft Float glass) and start below its actions row, so a category or
  Selection can be focused in a dock to colour the cube.
- **Leaving Inspect closes the cube.** The cube covers the map, so switching
  to another tool closes it (`useInspectCube`, on the mode transition), and
  it renders only in Inspect. Back in Inspect it stays closed until the next
  click.
- **Context budget follows the cube's preview budget.** The context region
  uses `budgets.preview` (`PREVIEW_REGION_BUDGET` in the product), so the
  harness's `?budgets=` reaches the `regionBox` path real sections take.
- **No new traits**, as planned.
