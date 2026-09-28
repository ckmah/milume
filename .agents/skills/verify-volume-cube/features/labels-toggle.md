# labels-toggle

The Labels switch loads the OME-Zarr labels on the image's grid on first use and
shows each cell's surface, plus any `highlight_groups` fills, in the same volume.

**Spec:** `frontend/e2e/volume-cube/volume-cube.spec.ts` — `"labels switch outlines cells as a second channel of the same volume"`

## Sub-features

- Labels off at boot: `data-labels="off"`, `data-channels="1"`, one canvas; labels
  OME-Zarr not loaded
- Labels on: `data-labels="on"`, `data-channels="2"`, still one canvas. Channel 1
  (`LabelVolumeSource`) holds each voxel's label id, negated on the cell's surface
  (a differently labelled 6-neighbour); `cell-lut-extension.ts` colours it on the
  GPU from a per-id lookup texture
- Labels off again: `data-labels="off"` but `data-channels` stays `"2"`: the switch
  (and any highlight change) rewrites only the lookup texture, so toggling is one
  redraw, not a refetch and re-upload of the window
- Labels on a different grid from the image: `data-labels="error"` and a status line
  (`from_ome_zarr(labels_path=...)` rejects it up front)

## How to get to it (user POV)

Below the volume viewport, toggle **Labels** to show or hide cell outlines and
highlighted cells.

## Driving it with Playwright

```ts
const widget = volumeCubeWidget(page);
await page.getByRole("switch", { name: "Labels" }).click();
await expect(widget).toHaveAttribute("data-labels", "on");
await expect(widget).toHaveAttribute("data-channels", "2");
await page.getByRole("switch", { name: "Labels" }).click();
await expect(widget).toHaveAttribute("data-labels", "off");
await expect(widget).toHaveAttribute("data-channels", "2"); // hidden, not unloaded
```

Helpers: `bootVolumeCubeHarness`, `volumeCubeWidget`, `shot`.

Model keys: `labels_url` (must be set for the switch to enable).

**Proof**

- Functional: `data-labels` follows the switch; one canvas throughout; the label
  channel stays loaded once used.
- Visual: `labels-off`.

## Gotchas

- `showLabels` is client-local, not a synced traitlet; `highlight_groups` from
  Python turns it on.
- The label channel is float32: ids above 2^24 lose precision. The lookup texture is
  a 2048-wide 3D texture (GPUs cap 3D axes at 2048), so ids up to 4M colour.
- luma.gl validates the program before assigning texture units: every sampler in the
  raycast must be a `sampler3D` (the lookup is one texel deep), and a shader module
  must not share a sampler's name.
