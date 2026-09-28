# cube-controls

The cube's own chrome: camera presets and tilt, projection mode, X/Y/Z cut and
contrast sliders that commit to traits on release, and the wireframe with µm
axes. Decision record: [ADR 0005](../../../../docs/adr/0005-widget-owns-rendering-controls.md).

**Spec:** `frontend/e2e/volume-cube/volume-cube.spec.ts` — `"in-widget controls: camera presets, projection, and a committed Z cut"`

## Sub-features

- **Top / Iso / Side** radios set the camera; tilt is clamped from 0° (head-on,
  perpendicular to Z) to 90° (straight down). Top at orbit 0 matches the
  Landmarks map (x right, y down)
- **Additive / MIP** switches Viv's compositing extension (`data-render`)
- **X / Y / Z cut** and **Contrast** range sliders render live and commit
  `slice_*` / `contrast_limits` once per gesture; X/Y are shown in µm from the
  window edge and follow the window when Inspect moves it (a full cut stays full)
- Wireframe around the loaded window and x/y/z axes with µm ticks, drawn in
  Viv's deck (`FramedVolumeView`, layer ids tagged with the view's `-#3d#`)
- Camera target is the window box centre, so cuts never move the cube

## How to get to it (user POV)

Below the cube: Reset, the camera and projection toggles, the Labels switch,
then one range slider per axis and contrast.

## Driving it with Playwright

```ts
const widget = volumeCubeWidget(page);
await widget.getByRole("radio", { name: "Top view" }).click();
await widget.getByRole("radio", { name: "Maximum intensity" }).click();
await expect(widget).toHaveAttribute("data-render", "mip");
const zHi = widget.getByRole("slider").nth(5); // X lo/hi, Y lo/hi, Z lo/hi, contrast lo/hi
await zHi.focus();
for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
await expect.poll(async () => Number(await getVolumeModel(page, "slice_z_max"))).toBe(54);
```

**Proof**

- Functional: presets toggle, projection attribute, keyboard-committed Z cut in the trait and readout.
- Visual: `rest` shows the wireframe and axes (Linux snapshots need regenerating).

## Gotchas

- Viv's texture stores Y rows reversed; the Y cut and Y axis labels are mirrored
  into texture space (`winH - y`), not data rows.
- Deck layers added beside the volume must carry Viv's view tag in their id or
  `VivViewer`'s `layerFilter` drops them.
