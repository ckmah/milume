# inspect-cube

Inspect is a temporary mode. Entering it (**I** or the cube icon) swaps the top
tool pill for the dashed-outline **Inspect pill** and shows the Inspect bar at
the bottom. A fixed 300 µm window square follows the cursor; a click, or a
press that is dragged and released, places it (no selection) and opens the
**immersive cube**: a `role="dialog"` named "Cube" that fills the plot area
(`.landmarks__body`, or the whole widget in fullscreen) and covers the map. It
shows the window coarse from the cache first, then level 0 (full resolution),
with labels drawn as shells and a highlight that follows the category panel's
focus. Shift+drag (or the bar's **Move** tool) pans the live window in XY from
inside the cube. Esc closes the cube and stays in Inspect; a second Esc, or
**Exit Inspect** on the pill, leaves Inspect for the tool used before.

**Spec:** `frontend/e2e/landmarks/landmarks-volume.spec.ts` — `"Landmarks inspect cube"` describe block
(`E2E_HARNESS=landmarks-volume`, run via `npm run test:e2e:landmarks`)

**Design:** [`docs/superpowers/specs/2026-09-25-landmarks-inspect-cube-design.md`](../../../docs/superpowers/specs/2026-09-25-landmarks-inspect-cube-design.md) · [`docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md`](../../../docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md) · [`docs/superpowers/specs/2026-10-02-inspect-immersive-cube-design.md`](../../../docs/superpowers/specs/2026-10-02-inspect-immersive-cube-design.md) · [`docs/superpowers/specs/2026-10-03-inspect-rework-design.md`](../../../docs/superpowers/specs/2026-10-03-inspect-rework-design.md) · [ADR 0006](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)

## Sub-features

The context region (a coarse, dimmed region around the window) was removed 2026-10-03; see [`2026-10-03-inspect-rework-design.md`](../../../docs/superpowers/specs/2026-10-03-inspect-rework-design.md). The cube shows only the window.

### Inspect pill (top)

- Entering Inspect swaps the tool pill (`getByRole("toolbar", { name: "Drawing tools" })`) for the Inspect pill (`data-testid="inspect-pill"`, `role="toolbar"`, `aria-label="Inspect"`, `chrome/inspect-pill.tsx`) in the same top-centre slot, with cube-motion `Rise` (the leaving pill is `inert` and takes no clicks). The swap follows `mode === "inspect"`, not the cube. The tool pill does not play its Rise on the widget's first mount. The pill's outline is a 1 px dashed border (`.landmarks-toolbar.landmarks__inspect-pill`), the one bordered toolbar, so the temporary mode reads at a glance
- **Armed** (`data-state="armed"`, no cube open): **Exit Inspect** (×, tooltip shortcut Esc) · "Inspect" · hint "Click to place a 300 µm window" (the size from `inspect_size_um`; below 640 px "Click to place a window") · Zoom in / Zoom out / Reset view (the map's camera, as on the tool pill) · Full screen
- **Open** (`data-state="open"`, the cube shows): Exit Inspect · "Inspect · 300 µm" · the window centre (`data-testid="inspect-centre"`, "x, y µm", hidden below 640 px) · status chip · **Save window** · Full screen
- Status chip (`data-testid="inspect-status"`, `role="status"`, `data-state="refining|ready|error"`): "Refining" with a gradient sweep across the text (none under `prefers-reduced-motion`), crossfading (cube-motion `Morph`) to "Ready" once the cube's fine level lands and the panned or moved window has settled (the shown window is the one asked for; until then `.volume-cube__view` has `data-refining="true"`); a window holding none of the volume (e.g. Python moving it off the volume) shows the error "Outside the volume" while the canvas reads "Inspect window is outside the volume"; an error shows the message, cut short with an ellipsis (`title` holds the full text). Closing the cube resets it to Refining, so a reopened cube starts over
- **Exit Inspect** closes the cube and sets `mode` back to the tool used before Inspect (default `select`); the tool pill returns with that radio checked. Leaving Inspect any other way (another tool, Python setting `mode`) also closes the cube
- Keyboard focus survives the swap: if the leaving pill held focus, it moves to **Exit Inspect** on entry and to the restored tool's checked radio on exit
- Esc: with the cube open, Esc closes it and stays armed; with no cube open, Esc leaves Inspect. Esc in an open menu (the palette) or an open bar panel closes only that. Esc that ends a press on the map (the engine's `close` event carries `press: true`) only ends the press. The engine (`handleKeyDown` in `milume/static/landmarks.js`) handles Esc on a `window` capture listener and emits `close`; `use-inspect-cube.ts` closes the cube or exits on it
- **Save window** first calls the engine's `setInspectWindow(inspect_cx, inspect_cy, inspect_size_um)` from the model (so a window moved by Python is not stale in the engine), then `saveInspect()`: it creates an **inspect selection** (`type: "inspect"`, `point_indices` = the points in the square, `window: { cx, cy, size_um, cut }` with `cut` = `volume_cut`), named `<top category> · <count>` (see [inspect-history](inspect-history.md)), focuses it and emits `commit`; `saveInspect()` returns `null` with no placed window or no 3D image. Save first writes the live window's cut (flushing the pending settle write), so a Save right after a move stores the new window's cut. While the live window equals a saved entry's window the button reads **Saved**, disabled, `data-saved="true"`

### Placing and the cube

- Hover in Inspect draws the window square with no model writes, a fixed 300 µm side at any zoom (`hover` events carry `sizeUm: 300` and `sizePx = 300 × 2 ** zoom`); a click places the window (`inspect_size_um = 300`) and opens the Cube dialog, with no selection
- The cube opens on mouse **release** (the engine's `release` event), not on press: a press-and-drag moves the window (the hover preview following, `inspect_cx` changing) with no cube, and the cube opens at the release point. A press always moves the live window, never a saved entry; the Escape / lost-release / blur ends of a press (below) open nothing
- The press's drag and release are heard on `window`: releasing over the chrome or outside the widget ends the press and saves the window where it is; Esc, a move with no button held (a lost release) or the page losing focus also end it
- A drag on the map slides the window live with the cube closed (`data-pan` on the hover preview mirrors nonzero, then settles back to `0,0` once the refetch lands); moves save `inspect_cx`/`inspect_cy` at most every 40 ms and the release saves the final position and opens the cube there
- The immersive cube (`role="dialog"`, `aria-label="Cube"`, `z-index` 21) is full-bleed over the plot area (its box matches `.landmarks__body`, or the whole widget in fullscreen) and covers the map while open, with rounded corners like `.landmarks__body` (square in fullscreen). The hover preview float is hidden while it is open. It fades/scales in from the viewport centre in `--duration-quick`, with no animation under `prefers-reduced-motion`
- The cube shows the preview level from the shared chunk cache first, then swaps to level 0 (s0) for the window: its budget is unlimited in the product (only the 3D texture axis limit, 2048, could make it coarser); the harness `?budgets=<preview>,<dock>` still forces a split on the toy pyramid (`data-level`, `data-refining="true"` while loading); reopening an already-loaded window reads every chunk from the cache, with no new chunk requests
- Camera: orbit (plain drag) around the window; zoom-out stops 2 steps below home. The cube opens in the bar's camera preset, top-down by default (`settings.preset` defaults to `"top"`); a preset picked before placing, or left from the last open, is the cube's first view, and a preset chosen before the cube's first frame (empty `data-zoom`) is kept. **Reset view** returns to the top-down home framed to the window; a preset click frames the window as that preset's home view (`reframeOnPreset`)
- An XYZ axis legend (`getByLabel("Axes")`, bottom-right of every cube view, `pointer-events: none`) shows each data axis projected by the camera; `data-axes` = each axis's screen angle (degrees, counter-clockwise from the right), `data-lengths` = projected lengths (0–1). Top-down: `data-axes="0,-90,0"`
- The user's non-hidden landmarks (`engine.getLandmarkGeometry()`; `subscribeLandmarks` fires on change) are drawn in the cube and the preview on the stack's top face, clipped to the live window; `data-overlays` on `.volume-cube__view` = the clipped feature count
- The Landmarks-hosted cube has no category legend — the right panel's category list already shows it
- No 3D image (`LandmarksWidget(adata)`, or a SpatialData without one): the Inspect pill still swaps in (armed) and the square still places (`data-testid="context-inspect-no-volume"` bottom pill, "No 3D image: build the widget from a SpatialData with a 3D image"), no cube opens, `saveInspect()` saves nothing, and Esc or Exit leaves Inspect

### Pan the live window (inside the cube)

- **Shift+drag** in the cube pans the live window in XY; a plain drag orbits. The bar's **Move** tool (hand icon, `aria-pressed`, `data-pan-mode="true"` on `.volume-cube__view`, grab cursor; `data-panning="true"` and a grabbing cursor while dragging) makes a plain drag pan. Move is disabled while the cube is closed and turns off when it closes
- The cube host catches the press in the capture phase, so the orbit controller never sees a pan: the camera stays (`data-axes`, `data-pitch`, `data-zoom` unchanged). A pointer delta maps to µm on the XY plane through the camera target (`volume-cube/pan.ts`); the tissue follows the pointer (drag right → `inspect_cx` decreases top-down; drag down → `inspect_cy` decreases), and the distance scales with the drag
- The centre is clamped to the volume's XY extent. `inspect_cx`/`inspect_cy` are written (`engine.moveInspectWindow`, the map's square follows) and saved at most every 40 ms, with a final save when the pan ends: on release, on a move with no primary button (a lost release), on blur, or when the cube closes mid-drag (Esc, a tool key). Other pointers' moves and releases are ignored. The cut's settle commit then writes `volume_cut` as after a map drag. The loaded tissue slides (`data-pan`), then the fine level for the new window swaps in (`data-pan="0,0"`)

### Labels as shells

- Labels draw only each cell's surface voxels (no interior fill). A highlighted cell (by category, or in the focused category/Selection) is a shell in its category colour at `HIGHLIGHT_ALPHA` 0.9; other cells are an orange shell (`OUTLINE.alpha` 0.4, or `behindHighlight` 0.12 while something is highlighted); every shell is scaled by the Labels **Alpha** slider (default 0.6, `DEFAULT_RENDER.cellAlpha`). Face-on, a shell's cap still reads as a disc; a cut shows the ring
- Highlight follows the Landmarks category panel: nothing focused colours every cell in the window by category, a focused category colours only its cells, a focused Selection colours its cells by category
- Show labels: on loads the labels (first use) and shows them with the highlight; off hides labels and highlights (`data-labels="off"`)

### Inspect bar (bottom) and its panels

- The Inspect bar (`data-testid="context-inspect-toolbar"`, row `context-toolbar-l1`) shows while in Inspect with a 3D image, before a window is placed too: `Top | Iso | Side` (radios "Top view", "Oblique view", "Side view") · **Move** · **Reset view** · **Adjust** · **Cross-section**. Nothing else: no switch, projection or palette on the bar. Cross-section shows "Loading volume…" (no sliders) until the cube has reported its ranges
- One panel at a time rises right-aligned above its button. Each trigger has `aria-expanded` and `aria-haspopup="dialog"`; each panel is the one `role="region"` named after it (Cross-section's inner section is not a second one). Esc while a panel is open closes only the panel (the cube stays): the engine defers to the open trigger (`[data-inspect-panel-group] [aria-haspopup="dialog"][aria-expanded="true"]`) instead of emitting `close`. Both panels are height-capped (`max-height: min(45cqh, 22rem)`, `cqh` of the widget box) and scroll inside, so they never cover most of the cube
- **Adjust** (`data-testid="context-cube-adjust"`, `aria-label="Adjust"`): two columns, **Image** (`adjust-image`) and **Labels** (`adjust-labels`), stacked below 640 px. Each column title carries its Show switch (`Show image`, default on; `Show labels`, default off, disabled with no labels) and a Reset (`Reset image`, `Reset labels`).
  - Image: Mode (`aria-label="Image projection"`, `Additive` | `MIP`), Palette (dropdown, swatch and name), Contrast (range; defaults to the volume's `contrast_limits`), Alpha (`Image alpha`, 1), Gamma (`Image gamma`, 1, on a log2 scale)
  - Labels: Mode (`aria-label="Labels projection"`, `Additive` | `MIP`), Alpha (`Label alpha`, 0.6)
  - **Reset all** (foot) resets Image and Labels (sliders and projections), not the cuts. Resets never change the Show switches. Every capsule is one width (10 rem), in both panels
- **Cross-section** (`data-testid="context-cube-cross"`, `aria-label="Cross-section"`; its section `data-testid="context-cube-cuts"`): X cut, Y cut, Z cut (range sliders in µm) and `Reset cross-section`, which opens every cut and commits `volume_cut` like a slider release
- Projection is per layer (`imageMode` / `labelMode`, client-local; `data-image-mode` / `data-label-mode` on `.volume-cube__view`, both `additive` by default). Image Additive accumulates samples; image MIP takes the maximum and is drawn opaque, so Image Alpha acts as brightness there. Labels Additive accumulates shells front to back; labels MIP takes the single strongest shell. Labels composite over the image in every combination. A toggle changes uniforms only (one shader, no recompile). The hover preview draws `imageMode="mip"`, `labelMode="additive"`
- Show image (client-local `showImage` → `VolumeCube` `showImage`): off, the image drops from the ray (no refetch); labels still draw, and with both off the cube is an empty frame. `data-image="on|off"` on `.volume-cube__view`, in the cube and the hover preview
- Cuts render live and commit `volume_cut` on release; X/Y are window-relative (an untouched/open edge tracks the window as it moves) while Z is absolute. An open Z (`volume_cut` set to `[]` from Python) shows the stack's edges in the Z readout, never ±Infinity. `volume_cut` also commits once, ~250 ms after a window move or pan settles, only while the cube is open

### Docks

- Entering Inspect collapses both side docks (`data-collapsed="true"`, peek tabs stay); a panel reopened mid-Inspect stays open; leaving Inspect restores the docks as they were before entering (client-local, no trait). While the cube is open (root class `landmarks--cube-open`) the docks and peek tabs float over it (`z-index` 22), so a peek tab reopens a dock over the cube and focusing a category or Selection there recolours it; the Inspect pill's Save and Exit stay clickable

## How to get to it (user POV)

`w = LandmarksWidget(sdata)` where `sdata` is a SpatialData with a 3D image on
the same grid as its labels (see [`docs/adr/0006-landmarks-hosts-volume-cube.md`](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)).
Press **I** or click the cube icon: the top pill turns into the dashed Inspect
pill and the window square follows the cursor, a fixed 300 µm at any zoom.
Click to place it and open the **Cube** over the map (or press, drag to
position, and release). Shift+drag in the cube (or turn on **Move**) to slide
the window across the tissue; plain drag orbits. **Save window** on the pill
keeps it as an inspect selection. The bottom bar holds the camera, Move, Reset
view, **Adjust** (Image and Labels) and **Cross-section** (cuts). Esc closes
the cube; Esc again, or ×, leaves Inspect. Focus a category or Selection in the
side panel to colour the cube.

## Driving it with Playwright

```ts
await bootLandmarksVolumeHarness(page);
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const pill = page.getByTestId("inspect-pill");
await expect(pill).toHaveAttribute("data-state", "armed");
const box = await canvasBox(page);
// The cube opens on mouse release: a click (down + up) opens it, and a
// press, drag and release opens it at the release point.
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

const cubeWindow = page.getByRole("dialog", { name: "Cube" });
await expect(cubeWindow).toBeVisible();
await expect(page.getByTestId("inspect-status")).toHaveAttribute("data-state", "ready");
const view = cubeWindow.locator(".volume-cube__view");
await expect(view).toHaveAttribute("data-channels", /1|2/);
```

Pan, cuts and the highlight:

```ts
// Shift+drag in the cube pans the live window (the spec's `dragCube` helper).
await page.keyboard.down("Shift");
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 80, cy, { steps: 4 });
await page.mouse.up();
await page.keyboard.up("Shift");
await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeLessThan(cx0);

const bar = page.getByTestId("context-inspect-toolbar");
await bar.getByRole("button", { name: "Cross-section", exact: true }).click();
const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
await zHi.focus();
await page.keyboard.press("ArrowLeft");
await expect.poll(async () => ((await getModel(page, "volume_cut")) as number[])[5]).toBeLessThan(64);

await setModel(page, { selected_kind: "type", selected_index: 0 });
await expect(view).toHaveAttribute("data-highlight", "1");
```

Labels, the image and the projections are in the Adjust panel (Esc then closes only the panel):

```ts
await bar.getByRole("button", { name: "Adjust" }).click();
const adjust = page.getByTestId("context-cube-adjust");
await adjust.getByRole("switch", { name: "Show labels" }).click();
await expect(view).toHaveAttribute("data-labels", "on");
await adjust.getByTestId("adjust-image").getByRole("radio", { name: "MIP" }).click();
await expect(view).toHaveAttribute("data-image-mode", "mip");
await page.keyboard.press("Escape"); // closes Adjust only
```

Helpers: `bootLandmarksVolumeHarness`, `canvasBox`, `getModel`, `setModel` (all
in `frontend/e2e/helpers.ts`); the spec's own `openCubeAtCentre`, `moveWindow`,
`dragCube`, `openAdjust`, `openCross`, `toggleShow`, `save`. Selectors:
`getByRole("radio", { name: "Inspect", exact: true })`,
`getByTestId("inspect-pill")` (`getByRole("button", { name: "Exit Inspect" | "Save window" })`),
`getByTestId("inspect-status")`, `getByRole("dialog", { name: "Cube" })`,
`.volume-cube__view` inside the dialog, `getByTestId("context-inspect-toolbar")`,
`getByTestId("context-cube-adjust" | "adjust-image" | "adjust-labels" | "context-cube-cross" | "context-cube-cuts")`.

Model keys: `mode`, `inspect_cx`, `inspect_cy`, `inspect_size_um`, `volume`,
`volume_label_ids`, `volume_cut`, `selections` (`type: "inspect"` entries).

**Proof**

Inspect pill and Esc:

- Functional: `"entering Inspect swaps the top pill for the dotted Inspect pill; Exit restores it"` — the Drawing tools toolbar is gone, the pill is `data-state="armed"` with the hint, its computed `border-style` is dashed; Exit restores the tool pill and `mode` leaves `inspect`.
- Functional: `"the Inspect pill shows Refining then Ready, with Save and Exit"` — open state, chip `ready`, Save enabled; Exit closes the cube and restores the tool pill.
- Functional: `"the status chip reads Refining while a level loads"` (`?budgets=2000,20000`) — `refining|ready` then `ready`; exit, re-enter and reopen: it starts over and settles again.
- Functional: `"a window outside the volume reads as an error on the chip, not Ready"` — `setModel` moves the window to (10000, 10000): the canvas reads "Inspect window is outside the volume" and the chip is `data-state="error"` with "Outside the volume"; moved back inside, it reads `ready`.
- Functional: `"Esc closes the cube, a second Esc exits Inspect"` — first Esc: no dialog, pill `armed`; second: no pill, tool pill back.
- Functional: `"with no cube open, Esc in a menu or a panel closes only that, not Inspect"` — Esc in the palette menu closes the menu (Adjust stays), then Adjust, then Cross-section; `mode` stays `inspect`.
- Functional: `"Exit and Esc go back to the tool used before Inspect"` — Move → Inspect → Exit gives `move`; Probe → Inspect → Esc, Esc gives `probe` with its radio checked.
- Functional: `"keyboard: the swap keeps focus in the widget, and Esc from focus alone leaves Inspect"` — pointer outside the widget; Space on the focused Inspect radio enters, focus is on Exit Inspect; Enter exits with focus on Select; again with Esc; a second Esc is harmless. Relies on the engine letting keyboard-focused controls take Space/Enter (see [pointer-or-select-modes](pointer-or-select-modes.md)).
- Functional (default harness, `landmarks.spec.ts`): `"Inspect without a 3D image places the square and opens no cube"` (the armed pill's Exit leaves Inspect) and `"Inspect without a 3D image: Esc leaves it for the tool pill"`.

Placing, the cube and Save:

- Functional: `"hover shows the window square without model writes; click opens the cube"` — hover writes nothing; a click sets `inspect_cx`, opens the Cube dialog, the pill shows "… µm", `selections` stays empty and there is no Selections row; Esc closes it.
- Functional: `"a drag moves the window with the cube closed; the cube opens on release"` — mid-drag `inspect_cx` has changed and there is no Cube dialog; the cube appears on mouse up.
- Functional: `"the cube fills the plot area and Esc returns to the map"` — the dialog's box covers `.landmarks__body` (within 2 px), the hover preview is hidden, and Esc removes the dialog.
- Functional: `"the square is a fixed 300 µm at any zoom"` — `getInspectOverlay().sizeUm` stays 300 across a zoom step; `hover` events carry `sizeUm: 300` and `sizePx = 300 × 2 ** zoom`; a click writes `inspect_size_um = 300` and the pill reads "300 µm".
- Functional: `"Save creates an inspect selection of the points in the 300 µm square"` — `saveInspect()` is `null` before a placement; after one (with a Z cut), Save makes `selections[0]` a `type: "inspect"` selection, `window` = `{ cx, cy, size_um: 300, cut: volume_cut }`, `point_indices` matching a linear scan (2 of the 3 toy cells); focus moves to it, a `commit` event fires, and its Selections row is `aria-current="true"`.
- Functional: `"the dock's Save adds one selection and row, then reads Saved until the window moves"` (`?window=100`) — Save adds one entry and one row and turns into a disabled "Saved" (`data-saved="true"`); a move re-enables it and a second Save adds a second row; clicking row 1 restores its window, so the button reads "Saved" again.
- Functional: `"Save right after a move stores the new window's cut"` (`?window=100`) — with an X trim, a move and a Save in one task (inside the ~250 ms settle): the entry's `window.cut` keeps the trim at the new window's edge, its open low edge is the volume's (0), and `volume_cut` equals it.
- Functional: `"Save after Python moves the window saves the new window, not a stale one"` — `setModel` writes `inspect_cx`; Save is still enabled and the entry's `window.cx` is the new value.
- Functional: `"presses move the live window, never a saved entry"` — a press inside the saved square moves only `inspect_cx`; the entry is unchanged after the cut's settle commit.
- Functional: `"a drag on the map slides the window; the cube reopens on release at the new window"` (`?window=100`) — with the cube closed (Esc) a drag moves `inspect_cx`; on release the cube reopens, refines and settles at `data-pan="0,0"` with the engine's placed window at the new `inspect_cx`.
- Functional: `"a quick drag saves the final window position on release"` — press, move and release inside one task (within the 40 ms save throttle) still save the final `inspect_cx` (`change:inspect_cx`), and the cube opens.
- Functional: `"a release over the chrome ends the press; Esc, a lost release or blur end it too"` — a release over the Inspect pill saves the last position, adds no selection and opens the cube; after Esc between press and release (mode stays `inspect`, pill armed), a buttonless move, or a window `blur`, later moves drag nothing and the cube stays closed.
- Functional: `"the dock shows the coarse level first, then refines"` (`@isolated`; an init script records every `data-level` the cube view is given from its first render) — a coarser level is shown before a finer one, and `data-refining` returns to `"false"`.
- Functional: `"reopening the same window reads every chunk from the cache"` — closing and reopening the same window fires no `/s\d+/c/` chunk requests.
- Functional: `"leaving Inspect closes the cube and frees the map; Esc from its chrome closes it"` — Exit closes the cube and the bar, `mode` is `select`, and the map is the top hit at the canvas centre; back in Inspect the cube stays closed; Esc with focus in the bar closes the cube (pill armed) and a second Esc exits; Esc after clicking into the cube closes it; Python setting `mode` closes it too.

Pan:

- Functional: `"shift-drag in the cube pans the live window; plain drag only orbits"` (`?window=100`) — a plain drag changes `data-axes` and leaves `inspect_cx`; a Shift+drag right (Top view) lowers `inspect_cx`, never orbits, the map's placed square follows, the chip reads `refining` at least once (a MutationObserver on `inspect-status`) and settles back to `ready`, and the cube settles at `data-pan="0,0"` with pitch and zoom unchanged.
- Functional: `"a pan saves its last move on release, and when Esc closes the cube mid-drag"` (`?window=100`) — synthetic Shift pointer events in one task (the second move inside the 40 ms throttle): after the release the saved `inspect_cx` (`change:inspect_cx`) equals the live one; pressed and moved without a release, then Esc closes the cube: the saved value equals the live one too.
- Functional: `"a pan follows only its own pointer and ends on a move with no button held"` (`?window=100`) — another pointer id's move and release leave `inspect_cx` and `data-panning="true"`; a buttonless move ends the pan (`data-panning="false"`) and a later move pans nothing.
- Functional: `"the Move tool makes a plain drag pan; the distance scales with the drag"` — Move is `aria-pressed="true"` and `data-pan-mode="true"`; a drag twice as long pans 1.7–2.3× as far; a horizontal drag leaves `inspect_cy`, a downward one lowers it; no orbit; Esc closes the cube and Move reads `aria-pressed="false"`.
- Functional: `"panning clamps the window centre to the volume"` — repeated drags stop `inspect_cx` at 0 (the toy volume's edge); `inspect_cy` stays inside 0–256.

Shells and projections:

- Pixels: `"labels draw as shells: a cell's rim is coloured, its core is not"` — image off, labels on, a 2 µm Z slab through the toy cells (`volume_cut [0,256,0,256,31,33]`): category-coloured core pixels < 0.25 × rim pixels (measured: filled 0.33, shells 0.09).
- Pixels: `"with Labels on each toy cell renders in its category colour in the dock"` (`@isolated`, `?window=100`, centre (130.5, 170.5): cells 2 and 3 only, `data-label-cells="2"`) — in the default Additive/Additive, > 200 type1-blue and > 200 type0-orange pixels appear when labels turn on, orange right of and above blue (an X or Y flip fails); the odd 101-voxel box checks unaligned R8/RG8 rows (`texStorage3D` widths contain 101) and `data-image-format="r8unorm"`. A local/global label-index mix-up changes the colours.
- Pixels: `"each toy cell keeps its category colour with Image MIP, under Labels Additive and Labels MIP"` — same window; Image MIP + Labels Additive (the preview's look) and Image MIP + Labels MIP (saturation cutoff 0.12; one shell at 0.9 × 0.6 is pale over the image MIP) both keep > 200 pixels per category in the right places.
- Functional: `"highlight follows focus: everything, a category, a Selection"` — also checks `data-label-format="rg8"` and `data-label-cells="3"`.
- Functional: `"the hosted cube has no category legend"` — `getByLabel("Highlighted cells")` has zero count.
- Pixels: `"Show image off hides the image in the dock and the preview; labels still draw"` (`?window=100`) — `data-image` `on` → `off`; under a quarter of the bright pixels; labels on adds > 200 category pixels; the preview reads `data-image="off"` and `data-labels="on"`.

Bar and panels:

- Functional: `"the bottom bar holds the view options; Adjust and Cross-section are separate panels"` — Move, Reset view, Adjust and Cross-section on the bar; no Projection or Palette there; opening Cross-section shows `context-cube-cuts` and no Adjust.
- Functional: `"Adjust has an Image and a Labels column with independent projections"` — Image MIP sets `data-image-mode="mip"` and leaves `data-label-mode="additive"`, and the other way round; Palette sits in the Image column.
- Functional: `"the projection toggles set the image and label modes"` — both default Additive (`aria-checked`); both MIP set both data attributes.
- Functional: `"panels stay short enough not to cover the cube"` — at 900×520 with the widget resized under 520 px, Adjust and Cross-section are each ≤ half the plot height.
- Functional: `"Adjust: Image and Labels sections, each with a Reset, and Reset all; Cross-section has its own Reset"` — headings Image, Labels; switches on/off; defaults `[0, 48, 1, 0]` (contrast, alpha, log2 gamma), label alpha 0.6, both Additive; every capsule ~160 px in both panels; each Reset restores its own sliders and projection and leaves the switches; Reset all restores Image and Labels; `Reset cross-section` commits `volume_cut = [0, 256, 0, 256, 0, 64]`; Reset all leaves a Z cut alone.
- Functional: `"panel triggers' a11y; Esc closes only the open panel, not the cube"` — `aria-haspopup="dialog"` and `aria-expanded` track each panel; each panel is the only region named after its trigger; Esc closes the panel, the Cube dialog stays; opening one panel closes the other.
- Functional: `"the Inspect toolbar shows before a window is placed; cut sliders wait for ranges without a crash"` — the bar shows with no cube; Cross-section reads "Loading volume" with no slider; the bar has no switch; Top view works without the cube.
- Functional: `"inspect toolbar: presets, MIP, palette, alpha/gamma, committed Z cut"` — Oblique reframes (`data-zoom` changes); Image MIP, viridis, gamma and alpha are uniforms only (`data-channels` stays 1); a Z cut commits `volume_cut[5] = 54`.
- Functional: `"a palette change before placing reaches the hover preview, then the dock"` — viridis picked in Adjust before placing: the preview and then the cube read `data-palette="viridis"`.
- Functional: `"partial X and Y cuts keep their place in a moved window; open edges stay open"`, `"Python's inspect and volume_cut writes are followed, never written back"`, `"a Z-only cut leaves X and Y whole for any window, edge windows too"` — the cut's window-relative X/Y, Python writes adopted and not echoed (`volume_cut = []` shows Z as `0–64 µm`, never Infinity).

Camera and overlays:

- Functional: `"the cube and the preview open top-down; an axis legend turns with the camera"` — Top view is checked on open; the legend reads `0,-90,0`; a drag changes `data-axes` and unchecks Top; Reset view restores it; the preview's legend is top-down too.
- Functional: `"the camera dips 45° below level, not further"`.
- Functional: `"a camera preset chosen before the dock's first frame is kept"` — with the volume's requests held 400 ms, Oblique clicked while `data-zoom=""` ends at `data-pitch="35"`; closing and reopening keeps Oblique.
- Functional: `"a preset picked on the bar before placing is the dock's first view"` — Oblique before placing: the cube opens at `data-pitch="35"`.
- Functional: `"landmarks crossing the window are drawn in the cube; ones outside are not"` and `"a window inside the volume draws only the landmarks crossing it, top edge included"` — `data-overlays` counts in the cube and the preview; a Y flip fails the second.

Docks:

- Functional: `"Inspect hides both side panels; leaving restores them as they were"` — both docks collapse in Inspect and are restored on leaving (pre-Inspect state wins); with no cube open, Esc from the peek tab leaves Inspect.
- Functional: `"peek tabs and docks float over the open cube; focusing a category there recolours it"` — with the cube open, the pill's Save and Exit and both peek tabs pass Playwright's hit-target check; the expanded right dock is the top hit over the cube; focusing `type1` there sets `selected_kind` `"type"` and `data-highlight` goes from 2 to 1.
- Visual: no dedicated named anchor (functional asserts cover the pill, dialog and bar); reuse `rest`/`selection-neighborhood` conventions if a screenshot is added later.

## Gotchas

- The `.volume-cube__view` inside `getByRole("dialog", { name: "Cube" })` carries the full `data-*` mirror (`data-channels`, `data-image-format`, `data-label-format`, `data-label-cells`, `data-image-mode`, `data-label-mode`, `data-pan`, `data-pan-mode`, `data-panning`, `data-palette`, `data-image-gamma`, `data-highlight`, `data-image`, `data-labels`, `data-level`, `data-refining`, `data-overlays`, `data-zoom`, `data-pitch`); scope selectors to the cube or the preview under test.
- The cube covers the map while open, so a test that presses or drags on the map closes it first (Esc; an open panel takes the first Esc), then drags; the release reopens the cube (`moveWindow` in the spec). A hover over the map with the cube open reaches nothing.
- In Inspect the tool pill is gone: `getByRole("radio", { name: "Inspect" })` and the other tool radios do not exist until Inspect is left. Leave with the pill's Exit or Esc (with no cube open), or `setModel(page, { mode })`.
- `Move` on the Inspect bar (a toggle button) is not the tool pill's Move radio (`getByRole("radio", { name: "Move" })`), which only exists outside Inspect.
- Cross-section's inner section is also a region named "Cross-section": scope with `getByTestId("context-cube-cross")` or `exact: true` plus `.and(...)`.
- Tests share one page per worker (`frontend/e2e/fixtures.ts`): a test with `page.addInitScript` must be tagged `{ tag: "@isolated" }`.
- `VolumeCube` is lazy-loaded on first cube open in the dev harness (the dialog shows "Loading cube…" briefly); the built `landmarks.mjs` inlines it, so Viv ships with every Landmarks widget.
- `volume_cut`'s open X/Y edges are written as the volume's extent, not the window's — assert against the volume bounds, not `inspect_cx ± inspect_size_um/2`, when an edge is untouched.
- The toy SpatialData harness places three cells (labels 1-3) at fixed µm coordinates in a 256 µm volume, so the 300 µm window holds all of it; tests that need a window moving inside the volume (cuts, pans, snapshots, preview) reload with `?window=100` (harness only: `LandmarksView`'s `inspectWindowUm` → `mountEngine`) — see the spec file's header comment.
- The fitted zoom frames the cells, not the volume (~6.5 px/µm on the toy): a 300 µm square is wider than the canvas there; zoom out (`zoomBy(-1)`) to click off-centre points.
