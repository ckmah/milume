# Inspect: immersive cube

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

- Outside-window dim in the raycast shader (fallback above).
- Opening from a small cell: the plot area may be short; the camera fit and
  chrome must hold at the minimum widget height.
- Coarse region budget on very large sections: reuse `PREVIEW_REGION_BUDGET`
  and the `fitsBudget` / `regionBox` rules; do not add a second budget.
