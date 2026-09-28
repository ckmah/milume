# highlight-groups

`highlight_groups` (set from Python, usually via `VolumeCubeWidget.highlight_cells`)
fills chosen cells in the cube, one colour per group: e.g. a Landmarks Selection's
cells by cell type, in `LandmarksWidget.category_colors` so the cube matches the map.

**Spec:** `frontend/e2e/volume-cube/volume-cube.spec.ts` — `"highlight_groups colour chosen cells and follow the Labels switch"`

## Sub-features

- Each group is `{name, color, labels}`; label ids index `labels_url`
- A non-empty highlight turns the Labels switch on (`data-highlight` = groups shown)
- Labels off hides highlights too (one switch for everything label-derived)
- A legend (`aria-label="Highlighted cells"`) lists the shown groups with swatches
- Changing groups rebuilds only the GPU lookup texture; colours are stored linear
  so an opaque cell renders in exactly its hex colour after Viv's sRGB conversion
- Highlighted cells composite before the image in each ray step, so bright stain
  does not wash the colour out; other cells' outlines go faint behind a highlight

## How to get to it (user POV)

In `colon_a2.py` (sibling `pyxa_scverse_demo` repo), promote a cell type's
neighborhood to a Selection on Landmarks and Inspect: the cube fills the
Selection's cells in the window by cell type. **Cell types** under the cube narrows it.

## Driving it with Playwright

```ts
await setVolumeModel(page, { highlight_groups: [{ name: "blob two", color: "#e377c2", labels: [2] }] });
await expect(page.getByRole("switch", { name: "Labels" })).toBeChecked();
await expect(widget).toHaveAttribute("data-highlight", "1");
await page.getByRole("switch", { name: "Labels" }).click();
await expect(widget).toHaveAttribute("data-highlight", "0");
```

**Proof**

- Functional: switch, `data-highlight`, legend and channel count follow the trait.
- Visual: none (not one of the three VolumeCube anchors in `frontend/e2e/README.md`).
