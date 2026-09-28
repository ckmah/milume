# inspect-cube

Inspect places a window-sized square on the map; a click opens a floating
**Cube** dialog with a 3D view of that window, its own context toolbar, and
a highlight that follows the category panel's focus. Drag pans it live; Esc
or the close button hides it.

**Spec:** `frontend/e2e/landmarks/landmarks-volume.spec.ts` — `"Landmarks inspect cube"` describe block
(`E2E_HARNESS=landmarks-volume`, run via `npm run test:e2e:landmarks`)

**Design:** [`docs/superpowers/specs/2026-09-25-landmarks-inspect-cube-design.md`](../../../docs/superpowers/specs/2026-09-25-landmarks-inspect-cube-design.md) · [ADR 0006](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)

## Sub-features

- Hover in Inspect draws the window square with no model writes; click places it (`inspect_cx`/`inspect_cy`) and opens the Cube dialog
- Drag pans the cube live (`data-pan` mirrors nonzero, then settles back to `0,0` once the refetch lands at the new window); moves save `inspect_cx`/`inspect_cy` at most every 40 ms and the release saves the final position
- Esc (while in Inspect) or the dialog's close button hides the cube; clicking again in Inspect reopens it; switching to another tool keeps it open
- Inspect context toolbar (`data-testid="context-inspect-toolbar"`): camera presets (Top/Iso/Side), Additive/MIP, Palette, Labels switch, and Cuts/Image/Cells level-2 panels
- Cuts (X, Y, Z range sliders in µm) render live and commit `volume_cut` on release; X/Y are window-relative (an untouched/open edge tracks the window as it moves) while Z is absolute
- An open Z (`volume_cut` set to `[]` from Python) shows the stack's edges in the Z readout, never ±Infinity
- `volume_cut` also commits once, ~250ms after a window move settles, only while the cube is open
- Highlight follows the Landmarks category panel: nothing focused colors every cell in the window by category, a focused category colors only its cells, a focused Selection colors its cells by category
- Entering Inspect collapses both side docks (`data-collapsed="true"`, peek tabs stay); a panel reopened mid-Inspect stays open; leaving Inspect restores the docks as they were before entering (client-local, no trait)
- Image panel: in Additive, Alpha scales each sample's opacity; in MIP the projection is opaque, so Alpha acts as brightness
- No 3D image (`LandmarksWidget(adata)`, or a SpatialData without one): the square still places (`data-testid="context-inspect-no-volume"` pill, "No 3D image: build the widget from a SpatialData with a 3D image"), no cube opens

## How to get to it (user POV)

`w = LandmarksWidget(sdata)` where `sdata` is a SpatialData with a 3D image on
the same grid as its labels (see [`docs/adr/0006-landmarks-hosts-volume-cube.md`](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)).
Press **I** or click the cube icon to arm Inspect; the window square follows
the cursor. Click to place it and open **Cube**; drag to pan it live. Focus a
category or Selection in the side panel to color the cube; the bottom context
toolbar shows the cube's controls while Inspect is active and the cube is
open.

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
`volume_label_ids`, `volume_cut`.

**Proof**

- Functional (docks): `"Inspect hides both side panels; leaving restores them as they were"` — both docks `data-collapsed="true"` in Inspect, restored on leaving, pre-Inspect state wins over mid-Inspect edits.
- Functional: `inspect_cx`/`inspect_cy` set on click, and the saved value equals the final position after a quick drag; `data-pan` nonzero mid-drag then `0,0`; `volume_cut` reflects a committed slider edit and stays window-relative across a drag; `volume_cut = []` shows Z as `0–64 µm`; `data-highlight` count matches focus.
- Visual: no dedicated named anchor yet (functional asserts cover the dialog and toolbar); reuse `rest`/`selection-neighborhood` conventions if a screenshot is added later.

## Gotchas

- The `.volume-cube__view` inside `getByRole("dialog", { name: "Cube" })` carries the full `data-*` mirror (`data-channels`, `data-render`, `data-pan`, `data-palette`, `data-image-gamma`, `data-highlight`, `data-labels`); the standalone `VolumeCubeWidget`'s own root also mirrors a subset (see [verify-volume-cube features README](../../verify-volume-cube/features/README.md)) — scope selectors to the widget you are testing.
- `VolumeCube` is lazy-loaded on first cube open in the dev harness (the dialog shows "Loading cube…" briefly); the built `landmarks.mjs` inlines it, so Viv ships with every Landmarks widget.
- `volume_cut`'s open X/Y edges are written as the volume's extent, not the window's — assert against the volume bounds, not `inspect_cx ± inspect_size_um/2`, when an edge is untouched.
- The toy SpatialData harness places three cells (labels 1-3) at fixed µm coordinates; a 100 µm window at canvas center covers all three across two categories — see the spec file's header comment for exact values.
