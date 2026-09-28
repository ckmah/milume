# inspect-window-placement

Harness toy inspect (100 µm square drag) updates synced `window_cx` / `window_cy` traits and the on-widget readout.

**Spec:** `frontend/e2e/volume-cube/volume-cube.spec.ts` — `"toy inspect drag updates synced window traits"`,
`"moving the window pans the loaded volume until the new window loads"`

## Sub-features

- Pointer drag on toy inspect tissue mock moves the 100 µm window square
- `window_cx` and `window_cy` update on the mock model
- Status line reflects rounded window coordinates
- Cube content is the data rows under the window (y down, like the toy inspect)
- Moving the window pans at once: the frame, axes and camera stay put while the
  loaded volume slides under them (clipped to the frame), then the new window's
  voxels replace it with no jump. `data-pan` is the loaded volume's offset in
  level voxels (`dx,dy`, y in Viv's reversed texture rows); `"0,0"` once loaded.
  Cuts never move the cube.

## How to get to it (user POV)

In the dev harness, use the **Toy inspect** panel on the left: click or drag on the
256 µm tissue square. The VolumeCube status line updates with new window coordinates.

In notebooks, the same traits are fed from Landmarks Inspect mode via Python
(`inspect_cx` → `window_cx`, etc.) — see the cross-widget note in [`../SKILL.md`](../SKILL.md).

## Driving it with Playwright

```ts
await bootVolumeCubeHarness(page);
const widget = volumeCubeWidget(page);
const { box } = await toyInspectBox(page);

await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58);
await page.mouse.up();
await page.waitForTimeout(200);

const cx = Number(await getVolumeModel(page, "window_cx"));
const cy = Number(await getVolumeModel(page, "window_cy"));
// cx roughly 140–210, cy roughly 120–180: the window sits on toy blob 2 (x 160, y 150)

await shot(page, "window-on-sphere", widget);
```

Helpers: `bootVolumeCubeHarness`, `toyInspectBox`, `getVolumeModel`, `volumeCubeWidget`, `shot`.

Model keys: `window_cx`, `window_cy`, `window_size_um`.

**Proof**

- Functional: `window_cx` / `window_cy` move off center; readout text matches rounded values.
- Visual: `shot(page, "window-on-sphere", widget)` → snapshot `window-on-sphere.png`.

## Gotchas

- Toy inspect exists only in `frontend/dev/volume-cube/main.tsx` — not in the shipped widget bundle.
- Drag coordinates are relative to the `.cursor-crosshair` inspect panel, not the Viv canvas.
