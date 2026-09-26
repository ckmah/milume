# Inspect: live pyramid preview, docked cube, inspect history

Status: approved in brainstorming (2026-09-26). Builds on
[ADR 0006](../../adr/0006-landmarks-hosts-volume-cube.md) and
[`2026-09-25-landmarks-inspect-cube-design.md`](2026-09-25-landmarks-inspect-cube-design.md).

## Goal

Inspect uses the image pyramid for two surfaces: a **live preview** that follows the
cursor at a coarse level, and a **docked cube** that loads the finest level the
window budget allows. Each commit becomes an **inspect selection**, and the dock
shows them as a history strip.

## Non-goals

- No image layer in the Landmarks main view. The main view stays about cells; a
  Z slider for browsing cells by depth is a separate, later idea.
- No 3D selection membership: Landmarks points have no Z.
- No pinned multi-cube dock; the dock shows one window at a time.
- No Python control over the square's size.

## Interaction

**Square size follows zoom.** The Inspect square is a fixed 160 screen px. Its
size in µm is `160 / zoomScale` (the 2D view's pixels per µm), so zooming out frames
more tissue at a coarser level, and zooming in frames less at a finer one.
`inspect_size_um` becomes an output that the browser writes at commit; Python reads
it and no longer sets it.

**Hover (Inspect mode).** A borderless preview float, about 240 px, sits beside the
square at a fixed offset and flips at viewport edges. It follows the cursor every
frame. It renders a max-intensity projection with a fixed camera and no controls,
and it follows the Labels toggle. It hides when the pointer leaves the volume's
extent or the canvas, on Esc, and on a tool change.

**Click (commit).**

1. The browser creates an inspect selection (below) and focuses it
   (`selected_kind = "selection"`, `selected_index`).
2. The dock (today's floating cube window, pinned) opens, or switches to that window.
3. The dock first shows the preview level from the cache, then swaps in the dock
   level once it has loaded.

**Drag.**

- A press inside the **focused** inspect selection's square moves that entry. The
  dock pans live, as today. On release, the entry's window and members update.
- A press anywhere else starts a new entry at the release point.

**History strip.** The strip runs along the dock's bottom edge, with one chip per
inspect selection in commit order; it scrolls horizontally when full.

- A chip shows the selection's colour and number, plus a 64 px snapshot of the
  dock, captured after the fine level renders.
- Snapshots live only in the browser (a map keyed by selection id), are never
  synced or saved, and fall back to the swatch after a reload.
- Clicking a chip, or selecting an inspect selection anywhere in the UI, focuses it
  and restores its window and cut in the dock.
- Deleting the selection removes its chip. With no inspect selections left, the
  dock closes.

**Cut.** The Z/X/Y cut stays view-only. Changing it while an entry is focused writes
the new cut into that entry's `window.cut` on release (the same release/settle rule
as `volume_cut`). Membership never changes because of the cut.

## Data model

An inspect selection is an ordinary entry in the `selections` trait:

```python
{
    "id": "...",                  # nextSelectionId
    "type": "inspect",
    "point_indices": [...],       # points inside the square, every depth
    "window": {
        "cx": float, "cy": float,   # square centre, µm (Landmarks frame)
        "size_um": float,           # square side at commit
        "cut": [x0, x1, y0, y1, z0, z1],  # same convention as volume_cut
    },
}
```

- Membership is the set of points inside the axis-aligned square, computed with the
  existing `selectionMemberIndices` rectangle path.
- An empty square (no points) still commits, so the history keeps the view, but it
  has zero members.
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
| Dock | the square (full depth) | 64M voxels (`WINDOW_VOXEL_BUDGET`) |

Worked A2 examples (0.45 µm in XY, 0.5 µm in Z, 284 planes, levels `s0`–`s6`):

| Square | Preview | Dock |
| --- | --- | --- |
| 860 µm (starting zoom) | `s4` (whole level resident) | `s2` |
| 500 µm | `s3` | `s1` |
| 100 µm | `s1` | `s0` |

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
- A zoom that changes the preview level triggers one recentre at the new level; the
  old region renders until the new one is ready.

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
- A dock commit cancels pending pre-fetches, which re-queue when the dock level has
  loaded.

**Dock coarse-then-fine.** On commit, the dock builds its window from the preview
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
| Pointer outside the volume's extent | No preview. A click still commits (empty cube, members from the square). |

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
  - zooming changes the square's µm size (`data-size-um`) and the preview level;
  - a click creates a `type: "inspect"` selection whose `point_indices` match the
    points in the square;
  - the dock shows the coarse level, then `data-level` switches to the dock level;
  - a second click adds a second chip; clicking the first chip restores its window
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
- `frontend/src/widgets/landmarks/use-inspect-cube.ts`: commits create or move
  inspect selections, and focusing an entry restores its view.
- `spatial_rx/static/landmarks.js`: zoom-scaled square, the press-inside-focused
  drag rule, the inspect selection commit, and hover events for the preview.
- `spatial_rx/landmarks.py`: docstring (height, `inspect_size_um` as an output).
- `tests/helpers.py`: toy pyramid.
- Docs: README Inspect paragraph, ADR 0006 addendum, and feature maps.
