# axis-slice-traits

X / Y / Z slice ranges are synced traitlets on `VolumeCubeWidget`, driven from outside the widget (Marimo sliders in `demos/volume-cube.py`, harness controls in `dev/volume-cube/`).

**Spec:** `frontend/e2e/volume-cube/volume-cube.spec.ts` — `"model patches update the window and axis slice readout"`

## Sub-features

- All six are in the store's frame (`voxel_size_um` / `origin_um`); X and Y are
  mapped into the loaded window and clamped to it, Z to the stack
- `slice_x_min` / `slice_x_max` clip the Viv X extent inside the inspect window
- `slice_y_min` / `slice_y_max` clip the Viv Y extent inside the inspect window
- `slice_z_min` / `slice_z_max` clip the Viv Z extent
- The camera target is the whole window box's centre, so cuts never move the cube
- Readout shows the shown box: window ∩ X/Y slices, and the Z slice

## How to get to it (user POV)

In a notebook, bind `mo.ui.range_slider` widgets to the six slice traitlets. The widget has no in-chrome slice sliders.

## Driving it with Playwright

```ts
await bootVolumeCubeHarness(page);
const widget = volumeCubeWidget(page);

// Boot window is 78–178 in X and Y; Y 60 clamps to the window's 78.
await setVolumeModel(page, { slice_x_min: 100, slice_x_max: 150, slice_y_min: 60, slice_y_max: 120 });
await expect(widget.getByText(/X 100–150 · Y 78–120 · Z 0–64/)).toBeVisible();

await setVolumeModel(page, { window_cx: 160, window_cy: 96, slice_z_min: 8, slice_z_max: 48 });
await expect(widget.getByText(/Z 8–48/)).toBeVisible();
```

Helpers: `bootVolumeCubeHarness`, `setVolumeModel`, `volumeCubeWidget`.

Model keys: `slice_x_min`, `slice_x_max`, `slice_y_min`, `slice_y_max`, `slice_z_min`, `slice_z_max`.

**Proof**

- Functional: readout text matches patched slice traitlets.

## Gotchas

- Slice traits are independent of `window_cx` / `window_cy` (Landmarks inspect contract). Notebook link still copies inspect center onto window traits only.
- Defaults on `VolumeCubeWidget.toy()` span the full toy volume (256×256×64 µm).
