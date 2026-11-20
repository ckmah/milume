# layers-controls

Cells visibility, micrometre diameter, image sliders, and the map scale bar.

**Spec:** `frontend/e2e/landmarks/landmarks-layers-473.spec.ts` — `"cells visibility, micrometre diameter, image sliders, and scale bar"`

## Sub-features

- Section and layer chevrons sit left of their labels
- Cells ON shows a diameter readout in µm and an opacity slider
- Cells OFF removes the points layer and disables the size slider without changing `point_size`
- Cells ON again restores the same readout and the points layer
- An expanded Image row shows opacity and contrast-range sliders
- The map scale bar labels a round length in µm

## How to get to it (user POV)

Open Layers. The Cells row is expanded. With `_um_per_unit` set, Diameter reads in µm. Switch Cells off and the dots leave. Switch it on and the same diameter comes back. Expand Image for that layer's opacity and contrast. The scale bar sits at the bottom of the map.

## Driving it with Playwright

```ts
await bootLandmarksHarness(page);
await setModel(page, { point_size: 4, _um_per_unit: 1, _cells_visible: true });
```

**Proof**

- Chevron box is left of the Cells label. The ON/OFF switch is right of the label.
- Readout text is `8.0 µm` while `point_size` is 4 and `_um_per_unit` is 1.
- After OFF, `getLayerIds()` does not include `landmarks-points` and `point_size` is unchanged. The size slider is disabled.
- After ON, the readout is `8.0 µm` again and `landmarks-points` is back.
- Image opacity and `DAPI contrast` are visible.
- `[data-testid=map-scale-bar]` contains `µm`.
