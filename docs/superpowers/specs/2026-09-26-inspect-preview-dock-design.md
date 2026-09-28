# Inspect: live pyramid preview, docked cube, inspect history

Status: approved in brainstorming (2026-09-26), revised after user feedback the
same day (fixed 300 µm window, level 0 dock, Save instead of commit-on-click,
top-down cube views with landmarks). Builds on
[ADR 0006](../../adr/0006-landmarks-hosts-volume-cube.md) and
[`2026-09-25-landmarks-inspect-cube-design.md`](2026-09-25-landmarks-inspect-cube-design.md).

## Goal

Inspect uses the image pyramid for two surfaces: a **live preview** that follows the
cursor at a coarse level, and a **docked cube** that loads level 0 (full
resolution) for the window. The dock's **Save** keeps the window as an **inspect
selection**, and the dock shows them as a history strip.

## Non-goals

- No image layer in the Landmarks main view. The main view stays about cells; a
  Z slider for browsing cells by depth is a separate, later idea.
- No 3D selection membership: Landmarks points have no Z.
- No pinned multi-cube dock; the dock shows one window at a time.
- No Python control over the square's size.

## Interaction

**Fixed window.** The Inspect square is a fixed 300 µm at any zoom.
`inspect_size_um` is an output that the browser writes (300) at placement; Python
reads it and no longer sets it.

**Hover (Inspect mode).** A frameless preview float, 240 px, sits beside the
square and flips at viewport edges; when neither side has room it pins to a widget
corner clear of the cursor. It follows the cursor every
frame. It renders a max-intensity projection with a fixed camera and no controls,
and it follows the Labels toggle. It hides when the pointer leaves the volume's
extent or the canvas, on Esc, and on a tool change.

**Click and drag** only place and move the live window; they never create or
change a selection. The dock opens (or follows the window), first showing the
preview level from the cache, then level 0 once it has loaded. Both cube views
open top-down (also on Reset), draw the user's landmarks on the stack's top face,
and show a small XYZ axis legend.

**Save.** The dock's title-bar **Save** creates an inspect selection (below) from
the live window and its cut, and focuses it. Saved entries are fixed snapshots.
While the live window equals a saved entry's window, the button reads **Saved**
and is disabled.

**History strip.** The strip runs along the dock's bottom edge, with one chip per
inspect selection in save order; it scrolls horizontally when full.

- A chip shows the selection's colour and number, plus a 64 px snapshot of the
  dock, captured after the fine level renders.
- Snapshots live only in the browser (a map keyed by selection id), are never
  synced or saved, and fall back to the swatch after a reload.
- Clicking a chip, or selecting an inspect selection anywhere in the UI, focuses it
  and restores its window and cut in the dock.
- Deleting the selection removes its chip. With no inspect selections left, the
  dock closes.

**Cut.** The Z/X/Y cut stays view-only. Changing it while a focused entry's window
is the live window writes the new cut into that entry's `window.cut` on release
(the same release/settle rule as `volume_cut`). Membership never changes because
of the cut.

## Data model

An inspect selection is an ordinary entry in the `selections` trait:

```python
{
    "id": "...",                  # nextSelectionId
    "type": "inspect",
    "point_indices": [...],       # points inside the square, every depth
    "window": {
        "cx": float, "cy": float,   # square centre, µm (Landmarks frame)
        "size_um": float,           # square side (300)
        "cut": [x0, x1, y0, y1, z0, z1],  # same convention as volume_cut
    },
}
```

- Membership is the set of points inside the axis-aligned square, computed with the
  existing `selectionMemberIndices` rectangle path.
- An empty square (no points) can still be saved, so the history keeps the view, but
  it has zero members.
- Python reads these entries with `selections`, `get_obs_names` and `assign_obs_mask`.
- No new traits.
- `inspect_cx` / `inspect_cy` / `inspect_size_um` and `volume_cut` keep their
  meaning for the focused entry.

## Loading

**Level picker.** `pickLevel(levels, frame, sizeUm, budget)` takes a voxel budget.
Both budgets respect `MAX_TEXTURE_AXIS` (2048).

| Surface | Budget covers | Budget |
| --- | --- | --- |
| Preview | the preview region (3× the square's side, full depth) | 8M voxels |
| Dock | the square (full depth) | unlimited: always `s0` below the axis limit |

On A2 (0.45 µm in XY, 284 planes) a 300 µm dock window is about 667 × 667 × 284
voxels at `s0`.

**Preview region.**

- The preview holds one texture per source (image and labels) for a region
  centred near the cursor. A hover move only changes the model matrix offset, the
  same mechanism as the dock's `data-pan`; there is no fetch or upload per move.
- When the square comes within half its side of the region's edge, the preview
  fetches a new region. Its centre leads the cursor by its recent velocity (the last
  100 ms) and is clamped to the volume.
- The current region keeps rendering, with the square clamped to its edge, until
  the new one swaps in.
- If the whole preview level fits the budget, the preview loads it once and never
  recentres.

**Chunk cache.**

- A decoded-chunk LRU is shared by the preview and the dock. It is keyed by array
  path plus chunk coordinates and capped at 256 MB of decoded bytes.
- Region and window assembly read chunks through it, so a cached recentre only
  copies memory.
- It is scoped per widget instance and dropped on unmount.

**Pre-fetch.**

- After each preview region loads, the preview-level chunks in a one-chunk ring
  around it queue for background fetch, ordered by alignment with the cursor's
  velocity.
- When the whole preview level fits under the cache cap, every chunk of that level
  queues instead.
- At most 2 pre-fetch requests run at a time, and dock and preview requests always
  go first.
- A dock placement cancels pending pre-fetches, which re-queue when the dock level has
  loaded.

**Dock coarse-then-fine.** On placement, the dock builds its window from the preview
level (already cached), then requests the dock level. It swaps only when the image
and labels at the dock level have both loaded (they share one grid, via
`matchingLevel`). While refining, the title bar reads "refining". `data-level` on
`.volume-cube__view` holds the displayed level index.

**Contexts.** Each Landmarks widget holds at most two WebGL contexts: the preview
(created on first hover in Inspect and hidden when idle) and the dock.

**Decode.** Decoding runs on the main thread. If recentres stutter under profiling,
move fetching and decoding to a Web Worker; that is follow-up work, out of scope here.

## Errors

| Failure | Behaviour |
| --- | --- |
| Preview region fetch fails | Hide the preview float; retry on the next recentre. No error UI. |
| Dock level fails, preview level shown | Keep the coarse view; the title bar shows the error. |
| Dock fails with nothing shown | Today's cube error state. |
| Pointer outside the volume's extent | No preview. A click still places the window (empty cube). |

## Chrome changes folded in

- The Landmarks widget's default height goes from 550 px to 720 px
  (`LandmarksView.tsx`, `landmarks.py` docstring). It still resizes.
- The Landmarks-hosted cube drops its category chip legend, because the right
  panel's category panel already shows it. The standalone `VolumeCubeWidget` keeps
  its legend.
- The demo (`pyxa_scverse_demo/colon_a2.py`) drops `inspect_size_um = 500`.

## Testing

Keep only feature and regression tests.

- **Toy data.** `tests.helpers.toy_spatialdata` gains an image and labels pyramid
  with at least 3 levels, so level choice is testable.
- **e2e** (`frontend/e2e/landmarks/landmarks-volume.spec.ts`):
  - hovering in Inspect shows the preview with `data-level` at the preview level;
    moving within the region fires no network requests;
  - moving past the recentre edge loads one new region;
  - the square stays 300 µm at any zoom; a click places it with no selection;
  - Save creates a `type: "inspect"` selection whose `point_indices` match the
    points in the square;
  - the dock shows the coarse level, then `data-level` switches to the dock level;
  - a second Save adds a second chip; clicking the first chip restores its window
    and cut;
  - deleting an inspect selection removes its chip;
  - changing the cut updates `window.cut` on release, and `point_indices` stay the
    same;
  - the hosted cube has no category legend.
- **pytest.**
  - Selections with `type: "inspect"` round-trip through `get_obs_names`.
  - Toy pyramid inference picks the matching labels level.
- **Feature maps.** Update `verify-landmarks/features/inspect-cube.md`, and add
  `inspect-history.md`.
- **Snapshots.** Regenerate the Linux baselines for the taller widget and the dock
  strip.

## Files

- `frontend/src/widgets/volume-cube/window-source.ts`: budget argument, region
  boxes, and reads through the chunk cache.
- `frontend/src/widgets/volume-cube/chunk-cache.ts` (new): decoded-chunk LRU and
  pre-fetch queue.
- `frontend/src/widgets/volume-cube/VolumeCube.tsx`: coarse-then-fine swap, a
  legend prop, and `data-level`.
- `frontend/src/widgets/landmarks/chrome/inspect-preview.tsx` (new): preview float
  and region logic.
- `frontend/src/widgets/landmarks/chrome/cube-window.tsx`: pinned dock and history
  strip.
- `frontend/src/widgets/landmarks/use-inspect-cube.ts`: Save (with the live cut),
  and focusing an entry restores its view.
- `spatial_rx/static/landmarks.js`: fixed 300 µm square, `saveInspect()`, and
  hover events for the preview.
- `spatial_rx/landmarks.py`: docstring (height, `inspect_size_um` as an output).
- `tests/helpers.py`: toy pyramid.
- Docs: README Inspect paragraph, ADR 0006 addendum, and feature maps.
