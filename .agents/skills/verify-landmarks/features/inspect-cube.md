# inspect-cube

Inspect places a fixed 300 µm window square on the map. A click, or a press
that is dragged and released, places it (no selection) and opens the
**immersive cube**: a `role="dialog"` named "Cube" that fills the plot area
(`.landmarks__body`, or the whole widget in fullscreen) and covers the map. It
shows the window coarse from the cache first, then level 0 (full resolution),
with its own context toolbar and a highlight that follows the category panel's
focus. It opens in the toolbar's camera preset (default Top), draws the user's
landmarks on the stack's top face and an XYZ axis legend in its corner. A
coarse, dimmed **context** region (3× the window) is drawn around the window,
and zoom-out stops just past it. Esc or **Close cube** returns to the map;
placing again moves the window.

**Spec:** `frontend/e2e/landmarks/landmarks-volume.spec.ts` — `"Landmarks inspect cube"` describe block
(`E2E_HARNESS=landmarks-volume`, run via `npm run test:e2e:landmarks`)

**Design:** [`docs/superpowers/specs/2026-09-25-landmarks-inspect-cube-design.md`](../../../docs/superpowers/specs/2026-09-25-landmarks-inspect-cube-design.md) · [`docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md`](../../../docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md) · [`docs/superpowers/specs/2026-10-02-inspect-immersive-cube-design.md`](../../../docs/superpowers/specs/2026-10-02-inspect-immersive-cube-design.md) · [ADR 0006](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)

## Sub-features

- Hover in Inspect draws the window square with no model writes, a fixed 300 µm side at any zoom (`hover` events carry `sizeUm: 300` and `sizePx = 300 × 2 ** zoom`); a click places the window (`inspect_size_um = 300`) and opens the Cube dialog, with no selection
- The cube opens on mouse **release** (the engine's `release` event), not on press: a press-and-drag moves the window (the hover preview following, `inspect_cx` changing) with no cube, and the cube opens at the release point. A press always moves the live window; the Escape / lost-release / blur ends of a press (below) open nothing
- The immersive cube (`role="dialog"`, `aria-label="Cube"`, `z-index` 21) is full-bleed over the plot area (its box matches `.landmarks__body`, or the whole widget in fullscreen) and covers the map while open; Esc or **Close cube**, then place again, to move the window. The hover preview float is hidden while it is open. It fades/scales in from the viewport centre in `--duration-quick`, with no animation under `prefers-reduced-motion`
- Chrome over the cube: the Inspect toolbar top centre; a second row below the tool pill, right-aligned (`data-testid="cube-actions"`), holds the title ("Cube · 300 µm", `refining` / error status), **Save** and **Close cube** (kept off the tool pill's row so the buttons are not under the view buttons); the inspect history strip is bottom-left (`getByLabel("Inspect history")`)
- Context: the cube loads a second coarse volume layer around the window (3× the window side, `PREVIEW_REGION_BUDGET`; `data-context="on"` on `.volume-cube__view`, `data-context-level` the context's pyramid level or `-1`, `data-context-refining` `"true"` while it loads), drawn first; the window layer is unchanged. The context is dimmed (`CONTEXT_DIM`) and desaturated (`CONTEXT_DESATURATE`), and never drawn over the window: the shader drops every context ray that crosses the window's column (analytic slab test, the window's exact µm extent), so when the cube is orbited, context in front of or behind the window column is not drawn; with X/Y cuts the cut-away part of the window shows empty. The hover preview reports `data-context="off"`
- Camera: zoom-out stops at log2(3) + 0.25 steps below home with the context (2 without it, as in the preview); no free pan, the orbit target stays on the window
- **Save** (title row, `aria-label="Save window"`) (`aria-label="Save window"`) first calls the engine's `setInspectWindow(inspect_cx, inspect_cy, inspect_size_um)` from the model (so a window moved by Python, with no press and no prior `setInspectWindow` call, is not stale in the engine), then `saveInspect()`: it creates an **inspect selection** (`type: "inspect"`, `point_indices` = the points in the square, `window: { cx, cy, size_um, cut }` with `cut` = `volume_cut`), focuses it and emits `commit`; `saveInspect()` returns `null` with no placed window or no 3D image. Save first writes the live window's cut (flushing the pending settle write), so a Save right after a move stores the new window's cut. While the live window equals a saved entry's window the button reads **Saved**, disabled, `data-saved="true"`; the disabled button never starts a title-bar drag
- The cube shows the preview level from the shared chunk cache first, then swaps to level 0 (s0) for the window: its budget is unlimited in the product (only the 3D texture axis limit, 2048, could make it coarser); the harness `?budgets=<preview>,<dock>` still forces a split on the toy pyramid (`data-level`, `data-refining="true"` while loading); reopening an already-loaded window reads every chunk from the cache, with no new chunk requests
- The cube opens in the Inspect toolbar's camera preset, top-down by default (`settings.preset` defaults to `"top"`, so an untouched cube opens with Top view checked); a preset picked on the bar before placing, or left from the last open, is the cube's first view. Reset returns to the top-down home, framed to the window's XY extent (the top face, allowing for perspective); a preset click frames the window as that preset's home view (`reframeOnPreset`, set by the cube and the preview only).
- An XYZ axis legend (`getByLabel("Axes")`, bottom-right of every cube view, clear of the frame's axis labels, `pointer-events: none`) shows each data axis projected by the camera, coloured like the frame's axes; `data-axes` = each axis's screen angle (degrees, counter-clockwise from the right), `data-lengths` = projected lengths (0–1). Top-down: `data-axes="0,-90,0"` (x right, y down as on the map, z at the viewer, length 0)
- The user's non-hidden landmarks (`engine.getLandmarkGeometry()`: map µm coordinates, sampled splines/shapes, the landmark's colour; `subscribeLandmarks` fires on change) are drawn in the cube and the preview on the stack's top face, clipped to the live window, over the volume and under the frame's axis labels; `data-overlays` on `.volume-cube__view` = the clipped feature count
- The Landmarks-hosted cube has no category legend — the right panel's category list already shows it.
- A drag on the map slides the window live with the cube closed (`data-pan` on the hover preview mirrors nonzero, then settles back to `0,0` once the refetch lands); moves save `inspect_cx`/`inspect_cy` at most every 40 ms and the release saves the final position and opens the cube there
- A press always moves the live window, never a saved entry (saved inspect selections are fixed snapshots)
- The press's drag and release are heard on `window`: releasing over the chrome or outside the widget ends the press and saves the window where it is; Esc, a move with no button held (a lost release) or the page losing focus also end it
- Esc (while in Inspect) or the **Close cube** button hides the cube and shows the map; clicking again in Inspect places the window and reopens it; switching to another tool keeps it open
- Inspect context toolbar (`data-testid="context-inspect-toolbar"`): camera presets (Top/Iso/Side), Additive/MIP, Palette, and one **Adjust** panel (`data-testid="context-cube-adjust"`, `role="region"`/`aria-label="Adjust"`, rising right-aligned above its button, short enough to clear the cube's history strip) with sections **Image** (a `Show image` switch beside the title, default on; Contrast, Image alpha, Image gamma), **Labels** (a `Show labels` switch, default off, disabled with no labels; Label alpha) and **Cuts** (X, Y, Z cut; `data-testid="context-cube-cuts"`), every capsule one width (10 rem). Each section's **Reset** (`Reset image` / `Reset labels` / `Reset cuts`) restores its sliders (contrast to the volume's `contrast_limits`, alphas and gamma to 1, cuts open and committed to `volume_cut` like a slider release); **Reset all** does all three. Resets never change the Show switches. The Adjust trigger reflects the panel with `aria-expanded` and `aria-haspopup="dialog"`; Esc while it is open closes only the panel (the cube stays open) — the engine's Escape handling (`handleKeyDown` in `milume/static/landmarks.js`, which otherwise closes the cube in Inspect) defers to the panel by clicking its open trigger (found via `[data-testid="context-cube-adjust-group"] [aria-haspopup="dialog"][aria-expanded="true"]`) instead of emitting `close`
- Cuts (X, Y, Z range sliders in µm) render live and commit `volume_cut` on release; X/Y are window-relative (an untouched/open edge tracks the window as it moves) while Z is absolute
- An open Z (`volume_cut` set to `[]` from Python) shows the stack's edges in the Z readout, never ±Infinity
- `volume_cut` also commits once, ~250ms after a window move settles, only while the cube is open
- Highlight follows the Landmarks category panel: nothing focused colors every cell in the window by category, a focused category colors only its cells, a focused Selection colors its cells by category
- Entering Inspect collapses both side docks (`data-collapsed="true"`, peek tabs stay); a panel reopened mid-Inspect stays open; leaving Inspect restores the docks as they were before entering (client-local, no trait)
- Image section: in Additive, Alpha scales each sample's opacity; in MIP the projection is opaque, so Alpha acts as brightness
- Show image (client-local `showImage`, no trait → `VolumeCube` `showImage`): off, the cube shader's `imageOn` uniform drops the image from the ray (no refetch); labels still draw, and with both off the cube is an empty frame. `data-image="on|off"` on `.volume-cube__view`, in the cube and the hover preview
- Show labels: on loads the labels (first use) and shows them with the highlight; off hides labels and highlights (`data-labels="off"`)
- A camera preset chosen before the cube's first frame (no camera yet: empty `data-zoom`) becomes the first view instead of being replaced by the top-down home; the cube reports `onPreset` only once it has a camera. The cube opens in whatever preset the toolbar shows (default Top)
- No 3D image (`LandmarksWidget(adata)`, or a SpatialData without one): the square still places (`data-testid="context-inspect-no-volume"` pill, "No 3D image: build the widget from a SpatialData with a 3D image"), no cube opens, and `saveInspect()` saves nothing

## How to get to it (user POV)

`w = LandmarksWidget(sdata)` where `sdata` is a SpatialData with a 3D image on
the same grid as its labels (see [`docs/adr/0006-landmarks-hosts-volume-cube.md`](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)).
Press **I** or click the cube icon to arm Inspect; the window square follows
the cursor, a fixed 300 µm at any zoom. Click to place it and open the **Cube**
over the map (or press, drag to position, and release); scroll to zoom out to
the dimmed context around the window; **Save** keeps it as an inspect selection;
Esc or **Close cube** returns to the map. Focus a category or Selection in the
side panel, or click an inspect-history chip (the cube's bottom-left strip), to color or restore the cube;
the bottom context toolbar shows the cube's controls while Inspect is active
and the cube is open.

## Driving it with Playwright

```ts
await bootLandmarksVolumeHarness(page);
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await canvasBox(page);
// The cube opens on mouse release: a click (down + up) opens it, and a
// press, drag and release opens it at the release point.
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

const cubeWindow = page.getByRole("dialog", { name: "Cube" });
await expect(cubeWindow).toBeVisible();
const view = cubeWindow.locator(".volume-cube__view");
await expect(view).toHaveAttribute("data-channels", /1|2/);
```

Cuts and the highlight:

```ts
await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Adjust" }).click();
const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
await zHi.focus();
await page.keyboard.press("ArrowLeft");
await expect.poll(async () => ((await getModel(page, "volume_cut")) as number[])[5]).toBeLessThan(64);

await setModel(page, { selected_kind: "type", selected_index: 0 });
await expect(view).toHaveAttribute("data-highlight", "1");
```

Labels and the image are switched in the Adjust panel (Esc then closes only the panel):

```ts
const adjust = page.getByTestId("context-cube-adjust");
await adjust.getByRole("switch", { name: "Show labels" }).click();
await expect(view).toHaveAttribute("data-labels", "on");
await adjust.getByRole("switch", { name: "Show image" }).click();
await expect(view).toHaveAttribute("data-image", "off");
```

Helpers: `bootLandmarksVolumeHarness`, `canvasBox`, `getModel`, `setModel` (all
in `frontend/e2e/helpers.ts`). Selectors:
`getByRole("radio", { name: "Inspect", exact: true })`,
`getByRole("dialog", { name: "Cube" })`, `.volume-cube__view` inside the
dialog, `getByTestId("context-inspect-toolbar")`, `getByTestId("cube-actions")`,
`getByLabel("Inspect history")` inside the dialog.

Model keys: `inspect_cx`, `inspect_cy`, `inspect_size_um`, `volume`,
`volume_label_ids`, `volume_cut`, `selections` (`type: "inspect"` entries).

**Proof**

- Functional: `"hover shows the window square without model writes; click opens the cube"` — hover writes nothing; a click sets `inspect_cx`, opens the Cube dialog, and leaves `selections` empty (no history strip); Close cube closes it.
- Functional: `"a drag moves the window with the cube closed; the cube opens on release"` — mid-drag `inspect_cx` has changed and there is no Cube dialog; the cube appears on mouse up.
- Functional: `"the cube fills the plot area and Esc returns to the map"` — the dialog's box covers `.landmarks__body` (within 2 px), its `.volume-cube__view` is visible, the hover preview is hidden, and Esc removes the dialog.
- Functional: `"the immersive cube loads a coarse context region around the window"` (`?window=100`) — `data-context="on"`, `data-context-level` becomes ≥ 0 and `data-context-refining` returns to `"false"`; after Esc the hover preview's view reads `data-context="off"`.
- Pixels: `"context draws dimmed around the window, never over it"` (`?window=100`) — zoomed out to the floor, strips just above and below the window's footprint (inside the 256 µm volume, clear of the chrome) have lit pixels (> 20) in both Additive and MIP (so the context draws) but none at the stain's full brightness (> 200), so the context is dimmed, and nothing from it covers the window.
- Functional: `"zoom out stops just past the context region"` (`?window=100`) — wheeling far out lowers `data-zoom` by more than 1.2 and less than about 1.88 steps from home (log2(3) + 0.25 and a margin; the preview's floor is 2).
- Functional: `"the square is a fixed 300 µm at any zoom"` — `getInspectOverlay().sizeUm` stays 300 across a zoom step; `hover` events carry `sizeUm: 300` and `sizePx = 300 × 2 ** zoom` before and after; a click writes `inspect_size_um = 300` ("Cube · 300 µm").
- Functional: `"Save creates an inspect selection of the points in the 300 µm square"` — `saveInspect()` is `null` before a placement; after one, clicking Save makes `selections[0]` a `type: "inspect"` selection, `window` = `{ cx: inspect_cx, cy: inspect_cy, size_um: 300, cut: volume_cut }`, `point_indices` matching a linear scan (2 of the 3 toy cells); focus moves to it, a `commit` event fires, and chip "Inspect 1" is pressed.
- Functional: `"the dock's Save adds one selection and chip, then reads Saved until the window moves"` (`?window=100`; the test keeps its old title; the Save button is in the cube's `cube-actions` row) — a click leaves `selections` empty; Save adds one entry and one chip and turns into a disabled "Saved" (`data-saved="true"`); a press elsewhere re-enables it and a second Save adds a second chip; clicking chip 1 restores its window, so the button reads "Saved" again.
- Functional: `"a chip gets its thumbnail when Save lands after the cube has settled"` — after the cube settles (fine level, `data-pan="0,0"`, then 1.5 s with no new frame), Save adds chip "Inspect 1" with an `img` thumbnail, from the live-window snapshot slot, though deck draws no frame after Save.
- Functional: `"Save right after a move stores the new window's cut"` (`?window=100`) — with an X trim, a move and a Save in one task (inside the ~250 ms settle): the entry's `window.cut` keeps the trim at the new window's edge, its open low edge is the volume's (0), and `volume_cut` equals it.
- Functional: `"Save after Python moves the window saves the new window, not a stale one"` — with the cube open, `setModel` writes `inspect_cx` directly (a Python move, bypassing the engine); Save is still enabled and the saved entry's `window.cx` equals the new `inspect_cx`, not the engine's last-placed position.
- Functional: `"Adjust trigger a11y; Esc closes only the Adjust panel, not the cube"` — the trigger's `aria-haspopup="dialog"` and `aria-expanded` track the panel; Esc while it is open removes the panel (`getByRole("region", { name: "Adjust" })`) and clears `aria-expanded`, while the Cube dialog stays visible.
- Functional: `"one Adjust panel: Image, Labels and Cuts sections, each with a Reset, and Reset all"` — headings in that order; two switches, `Show image` on and `Show labels` off; defaults `[0, 48, 1, 0]` (contrast, alpha, log2 gamma), label alpha 1, Z hi 64; every capsule the same ~160 px; after nudging every slider (and flipping both switches) each section Reset restores only its own sliders (`aria-valuenow`) and leaves the switches as set, Reset cuts commits `volume_cut = [0, 256, 0, 256, 0, 64]`, and Reset all restores every slider but not the switches (`data-image` stays `off`).
- Functional: `"the Inspect toolbar shows before a window is placed; …"` — also: the bar itself has no switch (the Show switches are in Adjust).
- Pixels: `"Show image off hides the image in the dock and the preview; labels still draw"` (`?window=100`) — `data-image` `on` → `off`; with both off the dock view has under a quarter of the bright (> 60) pixels it had with the image; turning labels on then adds > 200 category-coloured pixels (`data-channels="2"`, `data-image` still `off`); the hover preview reads `data-image="off"` and `data-labels="on"`; back on, both read `on`.
- Functional: `"a camera preset chosen before the dock's first frame is kept"` — with the volume's requests held 400 ms (`page.route`), Oblique is clicked while the cube has no camera (`data-zoom=""`); the cube ends at `data-pitch="35"` with Oblique checked (before the fix it ended top-down, 90, and the `onPreset` echo checked Top). Closing and reopening the cube reopens it in the toolbar's preset (Oblique, `data-pitch="35"`).
- Functional: `"a preset picked on the bar before placing is the dock's first view" (old title kept)` — Oblique on the bar with no cube, then a click to place: the cube opens at `data-pitch="35"` with Oblique checked. The untouched default (Top) is `"the cube and the preview open top-down; …"`.
- The `"the camera dips 45° below level, not further"` test clicks Side without waiting for `data-refining="false"`.
- Functional: `"presses move the live window, never a saved entry"` — a press elsewhere than the saved square moves only `inspect_cx`; the entry is unchanged after the cut's settle commit.
- Functional: `"a drag on the map slides the window; the cube reopens on release at the new window"` (`?window=100`) — with the cube closed (Esc; it covers the map while open) a drag moves `inspect_cx`; on release the cube reopens, refines, and settles at `data-pan="0,0"` with the engine's placed window at the new `inspect_cx`; Esc closes it and the hover overlay is null.
- Functional: `"a quick drag saves the final window position on release"` — press, move and release inside one task (within the 40 ms save throttle) still save the final `inspect_cx` (`change:inspect_cx`), and the cube opens.
- Functional: `"a release over the chrome ends the press; Esc, a lost release or blur end it too"` — a release over the tool pill saves the last position and adds no selection, and opens the cube; after Esc between press and release, a buttonless move, or a window `blur`, later moves drag nothing and the cube stays closed (these are not releases).
- Functional (no 3D image, `landmarks.spec.ts`, default harness): `"Inspect without a 3D image places the square and opens no cube"` — `inspect_cx` is set, no Cube dialog, `selections` unchanged.
- Functional: `"the dock shows the coarse level first, then refines"` (the test keeps its old title; it drives the immersive cube) — `data-level` shows a coarser level before a finer one, and `data-refining` returns to `"false"` once it lands.
- Functional: `"the cube and the preview open top-down; an axis legend turns with the camera"` — Top view is checked on open; the cube's legend reads `0,-90,0` with z length < 0.05; a drag inside the cube changes `data-axes` and unchecks Top; Reset view restores it; the hover preview's legend (after Esc) is top-down too. Standalone: `volume-cube.spec.ts` `"in-widget controls: …"` checks the legend and that the standalone cube opens oblique.
- Functional: `"landmarks crossing the window are drawn in the cube; ones outside are not"` — `getLandmarkGeometry()` returns the line as drawn; `data-overlays` is 1 for a line across the window, 0 for one wholly outside or hidden, 2 with a point added, in the dock and in the hover preview.
- Functional: `"a window inside the volume draws only the landmarks crossing it, top edge included"` (`?window=100`, window at (128, 60), y 10–110) — a line across the window's top edge counts (1); one inside the volume but below the window, or beside it, does not. A Y flip in the overlay mapping fails it.
- Functional: `"inspect toolbar: presets, MIP, palette, alpha/gamma, committed Z cut"` — the cube's Oblique preset reframes (`data-zoom` changes); standalone `volume-cube.spec.ts` `"in-widget controls: …"` checks that a preset keeps a wheel zoom.
- Functional: `"reopening the same window reads every chunk from the cache"` — closing and reopening the same window fires no `/s\d+/c/` chunk requests.
- Pixels: `"with Labels on each toy cell renders in its category colour in the dock"` (`?window=100`, window centre (130.5, 170.5): cells 2 and 3 only, `data-label-cells="2"`) — the first cell encoded is global 2, so local index 1 ≠ global id 1 and a local/global mix-up in the label texture or its lookup changes the colours (mutating `buildCellLut` to index by global id drops the blue count to 0). In MIP (cells in front of the image), two screenshots of the dock view, Labels off then on: pixels that take on type1's blue (#1f77b4, cell 3) and type0's orange (#ff7f0e, cell 2) each number > 200, and orange sits right of and above blue (cell 2 at (160, 150) against (100, 190); top-down x right, y down), so an X or Y flip fails too. The half-µm centre makes the level-0 box 101 voxels wide: the image's R8 rows (101 bytes) and the label texture's RG8 rows (202 bytes) are not 4-byte aligned, like A2's 667-wide windows; the test records R8 and RG8 `texStorage3D` widths and expects 101 in each, and checks `data-image-format="r8unorm"` (the image at one byte per voxel). Diffing the two screenshots leaves out the frame's axes and the axis legend.
- Functional: `"highlight follows focus: everything, a category, a Selection"` — also checks `data-label-format="rg8"` and `data-label-cells="3"` (all three toy cells in the 300 µm window).
- Functional: `"the hosted cube has no category legend"` — `getByLabel("Highlighted cells")` has zero count in the Landmarks-hosted cube.
- Functional: `"the cube stays open after switching tool; Esc from its chrome closes it"` — Select keeps the Cube dialog (the Inspect toolbar goes); back in Inspect, Esc with focus in the toolbar closes it; after reopening, Esc after clicking the cube's title closes it again.
- Functional (side docks): `"Inspect hides both side panels; leaving restores them as they were"` — both docks `data-collapsed="true"` in Inspect, restored on leaving, pre-Inspect state wins over mid-Inspect edits.
- Functional: `volume_cut` reflects a committed slider edit and stays window-relative across a drag; `volume_cut = []` shows Z as `0–64 µm`; `data-highlight` count matches focus.
- Visual: no dedicated named anchor yet (functional asserts cover the dialog and toolbar; the context's look is pinned by the pixel test above, not a snapshot); reuse `rest`/`selection-neighborhood` conventions if a screenshot is added later. Not covered: the orbited-context limit below (no test; judge it by eye in the harness or a notebook).

## Gotchas

- The `.volume-cube__view` inside `getByRole("dialog", { name: "Cube" })` carries the full `data-*` mirror (`data-channels`, `data-image-format`, `data-label-format`, `data-label-cells`, `data-render`, `data-pan`, `data-palette`, `data-image-gamma`, `data-highlight`, `data-labels`, plus `data-context`, `data-context-level`, `data-context-refining`); scope selectors to the cube or the preview under test.
- The cube covers the map while open, so a test that needs to press or drag on the map presses Esc first (the dialog is gone), then drags; the release reopens the cube. A hover over the map with the cube open reaches nothing.
- Context limit when orbited: the context drops every ray crossing the window's column (the window layer draws those), so with the camera tilted, context tissue in front of or behind the window column is not drawn; only the context beside the column is. From the top view this is invisible. A screen-space blur that would hold the focus when orbited (tier 2 of the spec) was not built.
- The context's refinement is its own level swap: wait for `data-context-refining="false"` as well as `data-refining="false"` before measuring `data-zoom` or pixels.
- `VolumeCube` is lazy-loaded on first cube open in the dev harness (the dialog shows "Loading cube…" briefly); the built `landmarks.mjs` inlines it, so Viv ships with every Landmarks widget.
- `volume_cut`'s open X/Y edges are written as the volume's extent, not the window's — assert against the volume bounds, not `inspect_cx ± inspect_size_um/2`, when an edge is untouched.
- The toy SpatialData harness places three cells (labels 1-3) at fixed µm coordinates in a 256 µm volume, so the 300 µm window holds all of it; tests that need a window moving inside the volume (cuts, pans, snapshots, preview) reload with `?window=100` (harness only: `LandmarksView`'s `inspectWindowUm` → `mountEngine`) — see the spec file's header comment.
- The fitted zoom frames the cells, not the volume (~6.5 px/µm on the toy): a 300 µm square is wider than the canvas there; zoom out (`zoomBy(-1)`) to click off-centre points.
