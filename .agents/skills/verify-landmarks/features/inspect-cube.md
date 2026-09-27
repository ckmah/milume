# inspect-cube

Inspect places a fixed 300 µm window square on the map; a click places it
(no selection) and opens/updates a floating **Cube** dialog — coarse from the cache first, then level 0 (full
resolution) — with its own context toolbar and a highlight that
follows the category panel's focus. It opens top-down, draws the user's
landmarks on the stack's top face and an XYZ axis legend in its corner. Drag
pans it live; Esc or the close button hides it.

**Spec:** `frontend/e2e/landmarks/landmarks-volume.spec.ts` — `"Landmarks inspect cube"` describe block
(`E2E_HARNESS=landmarks-volume`, run via `npm run test:e2e:landmarks`)

**Design:** [`docs/superpowers/specs/2026-09-25-landmarks-inspect-cube-design.md`](../../../docs/superpowers/specs/2026-09-25-landmarks-inspect-cube-design.md) · [`docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md`](../../../docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md) · [ADR 0006](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)

## Sub-features

- Hover in Inspect draws the window square with no model writes, a fixed 300 µm side at any zoom (`hover` events carry `sizeUm: 300` and `sizePx = 300 × 2 ** zoom`); a click places the window (`inspect_size_um = 300`) and opens the Cube dialog, with no selection
- The engine's `saveInspect()` (the dock's Save) creates an **inspect selection** (`type: "inspect"`, `point_indices` = the points in the square, `window: { cx, cy, size_um, cut }` with `cut` = `volume_cut`), focuses it and emits `commit`; it returns `null` with no placed window or no 3D image
- The dock shows the preview level from the shared chunk cache first, then swaps to level 0 (s0) for the window: its budget is unlimited in the product (only the 3D texture axis limit, 2048, could make it coarser); the harness `?budgets=<preview>,<dock>` still forces a split on the toy pyramid (`data-level`, `data-refining="true"` while loading); reopening an already-loaded window reads every chunk from the cache, with no new chunk requests
- The dock opens top-down (Top view checked; `settings.preset` defaults to `"top"`), and Reset returns to the top-down home, framed to the window's XY extent (the top face, allowing for perspective); a preset click frames the window as that preset's home view. The standalone `VolumeCubeWidget` still opens oblique
- An XYZ axis legend (`getByLabel("Axes")`, bottom-left of every cube view, `pointer-events: none`) shows each data axis projected by the camera, coloured like the frame's axes; `data-axes` = each axis's screen angle (degrees, counter-clockwise from the right), `data-lengths` = projected lengths (0–1). Top-down: `data-axes="0,-90,0"` (x right, y down as on the map, z at the viewer, length 0)
- The user's non-hidden landmarks (`engine.getLandmarkGeometry()`: map µm coordinates, sampled splines/shapes, the landmark's colour; `subscribeLandmarks` fires on change) are drawn in the dock and the preview on the stack's top face, clipped to the live window, over the volume and under the frame's axis labels; `data-overlays` on `.volume-cube__view` = the clipped feature count
- The Landmarks-hosted cube has no category legend — the right panel's category list already shows it; the standalone `VolumeCubeWidget` keeps its own
- Drag pans the cube live (`data-pan` mirrors nonzero, then settles back to `0,0` once the refetch lands at the new window); moves save `inspect_cx`/`inspect_cy` at most every 40 ms and the release saves the final position
- A press always moves the live window, never a saved entry (saved inspect selections are fixed snapshots)
- The press's drag and release are heard on `window`: releasing over the dock, chrome or outside the widget ends the press and saves the window where it is; Esc, a move with no button held (a lost release) or the page losing focus also end it
- Esc (while in Inspect) or the dialog's close button hides the cube; clicking again in Inspect reopens it; switching to another tool keeps it open
- Inspect context toolbar (`data-testid="context-inspect-toolbar"`): camera presets (Top/Iso/Side), Additive/MIP, Palette, Labels switch, and Cuts/Image/Cells level-2 panels
- Cuts (X, Y, Z range sliders in µm) render live and commit `volume_cut` on release; X/Y are window-relative (an untouched/open edge tracks the window as it moves) while Z is absolute
- An open Z (`volume_cut` set to `[]` from Python) shows the stack's edges in the Z readout, never ±Infinity
- `volume_cut` also commits once, ~250ms after a window move settles, only while the cube is open
- Highlight follows the Landmarks category panel: nothing focused colors every cell in the window by category, a focused category colors only its cells, a focused Selection colors its cells by category
- Entering Inspect collapses both side docks (`data-collapsed="true"`, peek tabs stay); a panel reopened mid-Inspect stays open; leaving Inspect restores the docks as they were before entering (client-local, no trait)
- Image panel: in Additive, Alpha scales each sample's opacity; in MIP the projection is opaque, so Alpha acts as brightness
- No 3D image (`LandmarksWidget(adata)`, or a SpatialData without one): the square still places (`data-testid="context-inspect-no-volume"` pill, "No 3D image: build the widget from a SpatialData with a 3D image"), no cube opens, and `saveInspect()` saves nothing

## How to get to it (user POV)

`w = LandmarksWidget(sdata)` where `sdata` is a SpatialData with a 3D image on
the same grid as its labels (see [`docs/adr/0006-landmarks-hosts-volume-cube.md`](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)).
Press **I** or click the cube icon to arm Inspect; the window square follows
the cursor, a fixed 300 µm at any zoom. Click to place it and open **Cube**;
drag to pan it live; Save keeps it as an inspect selection. Focus a category, Selection or an
inspect-history chip in the side panel/dock to color or restore the cube;
the bottom context toolbar shows the cube's controls while Inspect is active
and the cube is open.

## Driving it with Playwright

```ts
await bootLandmarksVolumeHarness(page);
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await canvasBox(page);
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

const cubeWindow = page.getByRole("dialog", { name: "Cube" });
await expect(cubeWindow).toBeVisible();
const view = cubeWindow.locator(".volume-cube__view");
await expect(view).toHaveAttribute("data-channels", /1|2/);
```

Cuts and the highlight:

```ts
await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cuts" }).click();
const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
await zHi.focus();
await page.keyboard.press("ArrowLeft");
await expect.poll(async () => ((await getModel(page, "volume_cut")) as number[])[5]).toBeLessThan(64);

await setModel(page, { selected_kind: "type", selected_index: 0 });
await expect(view).toHaveAttribute("data-highlight", "1");
```

Helpers: `bootLandmarksVolumeHarness`, `canvasBox`, `getModel`, `setModel` (all
in `frontend/e2e/helpers.ts`). Selectors:
`getByRole("radio", { name: "Inspect", exact: true })`,
`getByRole("dialog", { name: "Cube" })`, `.volume-cube__view` inside the
dialog, `getByTestId("context-inspect-toolbar")`.

Model keys: `inspect_cx`, `inspect_cy`, `inspect_size_um`, `volume`,
`volume_label_ids`, `volume_cut`, `selections` (`type: "inspect"` entries).

**Proof**

- Functional: `"hover shows the window square without model writes; click opens the cube"` — a click sets `inspect_cx`, opens the dock, and leaves `selections` empty (no history strip).
- Functional: `"the square is a fixed 300 µm at any zoom"` — `getInspectOverlay().sizeUm` stays 300 across a zoom step; `hover` events carry `sizeUm: 300` and `sizePx = 300 × 2 ** zoom` before and after; a click writes `inspect_size_um = 300` ("Cube · 300 µm").
- Functional: `"Save creates an inspect selection of the points in the 300 µm square"` — `saveInspect()` is `null` before a placement; after one it returns 0 and `selections[0]` is `type: "inspect"`, `window` = `{ cx: inspect_cx, cy: inspect_cy, size_um: 300, cut: volume_cut }`, `point_indices` matching a linear scan (2 of the 3 toy cells); focus moves to it, a `commit` event fires, and chip "Inspect 1" is pressed.
- Functional: `"presses move the live window, never a saved entry"`, `"drag pans the cube; Esc closes it"`, `"a quick drag saves the final window position on release"` — a drag starting inside the saved square moves only `inspect_cx`; the entry is unchanged; `data-pan` settles to `0,0` after a move.
- Functional: `"a release over the dock ends the press; Esc, a lost release or blur end it too"` — a release over the dock's title bar saves the last position (`change:inspect_cx`) and adds no selection; after Esc, a buttonless move, or a window `blur`, later moves drag nothing.
- Functional (no 3D image, `landmarks.spec.ts`, default harness): `"Inspect without a 3D image places the square and opens no cube"` — `inspect_cx` is set, no Cube dialog, `selections` unchanged.
- Functional: `"the dock shows the coarse level first, then refines"` — `data-level` shows a coarser level before a finer one, and `data-refining` returns to `"false"` once it lands.
- Functional: `"the dock and the preview open top-down; an axis legend turns with the camera"` — Top view is checked on open; the dock's legend reads `0,-90,0` with z length < 0.05; a drag inside the dock changes `data-axes` and unchecks Top; Reset view restores it; the hover preview's legend is top-down too. Standalone: `volume-cube.spec.ts` `"in-widget controls: …"` checks the legend and that the standalone cube opens oblique.
- Functional: `"landmarks crossing the window are drawn in the cube; ones outside are not"` — `getLandmarkGeometry()` returns the line as drawn; `data-overlays` is 1 for a line across the window, 0 for one wholly outside or hidden, 2 with a point added, in the dock and in the hover preview.
- Functional: `"reopening the same window reads every chunk from the cache"` — closing and reopening the same window fires no `/s\d+/c/` chunk requests.
- Functional: `"the hosted cube has no category legend"` — `getByLabel("Highlighted cells")` has zero count in the Landmarks-hosted dock.
- Functional (docks): `"Inspect hides both side panels; leaving restores them as they were"` — both docks `data-collapsed="true"` in Inspect, restored on leaving, pre-Inspect state wins over mid-Inspect edits.
- Functional: `volume_cut` reflects a committed slider edit and stays window-relative across a drag; `volume_cut = []` shows Z as `0–64 µm`; `data-highlight` count matches focus.
- Visual: no dedicated named anchor yet (functional asserts cover the dialog and toolbar); reuse `rest`/`selection-neighborhood` conventions if a screenshot is added later.

## Gotchas

- The `.volume-cube__view` inside `getByRole("dialog", { name: "Cube" })` carries the full `data-*` mirror (`data-channels`, `data-render`, `data-pan`, `data-palette`, `data-image-gamma`, `data-highlight`, `data-labels`); the standalone `VolumeCubeWidget`'s own root also mirrors a subset (see [verify-volume-cube features README](../../verify-volume-cube/features/README.md)) — scope selectors to the widget you are testing.
- `VolumeCube` is lazy-loaded on first cube open in the dev harness (the dialog shows "Loading cube…" briefly); the built `landmarks.mjs` inlines it, so Viv ships with every Landmarks widget.
- `volume_cut`'s open X/Y edges are written as the volume's extent, not the window's — assert against the volume bounds, not `inspect_cx ± inspect_size_um/2`, when an edge is untouched.
- The toy SpatialData harness places three cells (labels 1-3) at fixed µm coordinates in a 256 µm volume, so the 300 µm window holds all of it; tests that need a window moving inside the volume (cuts, pans, snapshots, preview) reload with `?window=100` (harness only: `LandmarksView`'s `inspectWindowUm` → `mountEngine`) — see the spec file's header comment.
- The fitted zoom frames the cells, not the volume (~6.5 px/µm on the toy): a 300 µm square is wider than the canvas there; zoom out (`zoomBy(-1)`) to click off-centre points.
