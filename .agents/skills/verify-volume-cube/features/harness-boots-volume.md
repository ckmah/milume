# harness-boots-volume

VolumeCube harness loads the toy OME-Zarr and renders an isometric Viv volume with chrome controls.

**Spec:** `frontend/e2e/volume-cube/volume-cube.spec.ts` — `"harness boots and OME-Zarr volume renders"`

## Sub-features

- Vite harness serves toy OME-Zarr from `frontend/dev/volume-cube/public/`
- `.volume-cube` shell mounts with Reset, Labels switch
- Default window readout at center (128, 128) · 100 µm with full-volume slice ranges
- WebGL canvas visible inside the volume host
- Z is the vertical axis (`Z_UP` model matrix): the orbit spins around the stack and
  Z slicing cuts horizontal slabs
- Home camera (load + Reset) frames the upright `window_size_um` inspect window box
  (horizontal diagonal × foreshortened stack height), not the whole volume
- Image display range from the `contrast_limits` trait (default `[0, 48]`)
- Only the inspect window is loaded (`window-source.ts`): one box cut from the
  finest pyramid level within a 64 M voxel budget, fetched once and served to
  Viv plane by plane; the readout appends `· level N` when above level 0

## How to get to it (user POV)

Open the volume-cube dev harness (`npm run dev:volume-cube`). After OME-Zarr fetch,
the isometric cube appears with toolbar controls below the viewport.

## Driving it with Playwright

```ts
await bootVolumeCubeHarness(page);
const widget = volumeCubeWidget(page);

await expect(widget).toBeVisible();
await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
await expect(page.getByRole("switch", { name: "Labels" })).toBeChecked();
await expect(widget.getByText(/window 128, 128 · 100 µm · X 0–256 · Y 0–256 · Z 0–64/)).toBeVisible();
await expect(widget.locator("canvas").first()).toBeVisible();

await shot(page, "rest", widget);
```

Helpers: `bootVolumeCubeHarness`, `volumeCubeWidget`, `shot`.

Selectors: `.volume-cube`, `getByRole("button", { name: "Reset" })`.

Model keys: `image_url`, `window_cx`, `window_cy`, `window_size_um`, `contrast_limits`,
`voxel_size_um`, `origin_um`.

**Proof**

- Functional: Reset/Labels visible; window readout at default center; canvas present.
- Visual: `shot(page, "rest", widget)` → snapshot `rest.png`.

## Gotchas

- Wait for OME-Zarr load via `bootVolumeCubeHarness` — do not snapshot while `"Loading volume…"` is shown.
- Harness models omit `contrast_limits`; the view falls back to `[0, 48]`.
- Playwright must set `E2E_HARNESS=volume-cube` (via `npm run test:e2e:volume-cube`) so the correct Vite root starts.
