# labels-toggle

The Labels switch loads the OME-Zarr labels on the image's grid on first use and
shows each cell's surface, plus any `highlight_groups` fills, in the same volume.

**Spec:** `frontend/e2e/volume-cube/volume-cube.spec.ts` — `"labels switch outlines cells from a compact label texture beside the image"`, `"a window with more cells than the label texture indexes shows a status, not labels"`

## Sub-features

- Labels off at boot: `data-labels="off"`, `data-channels="1"`, one canvas,
  `data-label-format="none"` on `.volume-cube__view`; labels OME-Zarr not loaded
- Labels on: `data-labels="on"`, `data-channels="2"` (the raycast draws the image
  and the label texture), still one canvas. Viv is handed the image alone, at its
  own dtype; the labels are a separate RG8 3D texture on the same grid
  (`cell-volume.ts`): each window's global ids map to local indices 1..N,
  `idx = r + 256 * (g & 127)`, surface flag `g & 128` (a differently labelled
  6-neighbour). `data-label-format="rg8"` once that texture is on the GPU,
  `data-label-cells` = N. `cell-lut-extension.ts` colours cells from a
  per-window lookup texture keyed by local index
- Labels off again: `data-labels="off"`, `data-channels="1"`, but
  `data-label-format` stays `"rg8"`: the switch (and any highlight change)
  rewrites only the lookup texture, so toggling is one redraw, not a refetch and
  re-upload of the window
- More than 32767 cells in one window: `data-labels="error"`, status "Too many
  cells in this window for labels", image alone (`data-channels="1"`,
  `data-label-format="none"`). No fallback encoding
- Labels on a different grid from the image: `data-labels="error"` and a status line
  (`from_ome_zarr(labels_path=...)` rejects it up front)

## How to get to it (user POV)

Below the volume viewport, toggle **Labels** to show or hide cell outlines and
highlighted cells.

## Driving it with Playwright

```ts
const widget = volumeCubeWidget(page);
const view = widget.locator(".volume-cube__view");
await page.getByRole("switch", { name: "Labels" }).click();
await expect(widget).toHaveAttribute("data-labels", "on");
await expect(widget).toHaveAttribute("data-channels", "2");
await expect(view).toHaveAttribute("data-label-format", "rg8");
await expect(view).toHaveAttribute("data-label-cells", "3"); // boot window
await page.getByRole("switch", { name: "Labels" }).click();
await expect(widget).toHaveAttribute("data-labels", "off");
await expect(widget).toHaveAttribute("data-channels", "1");
await expect(view).toHaveAttribute("data-label-format", "rg8"); // hidden, not unloaded
```

The too-many-cells test routes `labels/cells/0/.zarray` to `<u4` and every
labels chunk to a new id per voxel.

Helpers: `bootVolumeCubeHarness`, `volumeCubeWidget`, `shot`.

Model keys: `labels_url` (must be set for the switch to enable).

**Proof**

- Functional: `data-labels` follows the switch; one canvas throughout; the label
  texture stays on the GPU once used; the cell limit shows its status.
- Pixels: the Landmarks dock test `"with Labels on each toy cell renders in its
  category colour in the dock"` (verify-landmarks `inspect-cube`).
- Visual: `labels-off`.

## Gotchas

- `showLabels` is client-local, not a synced traitlet; `highlight_groups` from
  Python turns it on.
- Local indices are 15 bits (N ≤ 32767 per window); global ids are exact at any
  size (uint32 or wider), since only the lookup sees them.
- The RG8 texels are written in Viv's own texel order (`getVolume` in
  `@vivjs/layers`: rows reversed, with its `%`-on-negative quirk), so labels and
  image line up voxel for voxel.
- Viv keeps drawing the old image while it copies a new window; the shader binds
  the labels of the image actually drawn (the VolumeLayer's `onViewportLoad`
  tags each volume with its window), and a retired window's label texture is
  destroyed once no layer draws it.
- Viv 0.22 uploads every 3D texture as float32 (`getRenderingAttrs` casts), so
  the image still costs 4 B/voxel on the GPU even at uint8.
- The lookup texture is a 2048-wide 3D texture (GPUs cap 3D axes at 2048).
- luma.gl validates the program before assigning texture units: every sampler in
  the raycast must be a `sampler3D` (the lookups are one texel deep), each must be
  bound on every draw (a 1×1×1 RG8 texture stands in without labels), and a
  shader module must not share a sampler's name.
- A texture created with `data` keeps a reference to it in luma.gl's props; the
  label texture is written with `copyImageData` after creation so its CPU texels
  can be freed.
