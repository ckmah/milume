# Landmarks hosts the volume cube: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `LandmarksWidget(sdata)` infers a SpatialData's 3D image and cell labels, and its Inspect tool opens a floating 3D cube of the window inside the widget, with the cube's controls in the context toolbar; plus a regrouped main toolbar and collapsible side panels.

**Architecture:** Python resolves table, labels and image from SpatialData metadata, serves the store on loopback, and sets three compact traits. The React chrome renders a shared `VolumeCube` component (split out of `VolumeCubeView`) in a floating window, computes which cells to colour from Landmarks' own state, and keeps every rendering control client-local. The engine (`landmarks.js`) draws the hover square and reports placements.

**Tech Stack:** Python (anywidget, traitlets, spatialdata 0.8, numpy), React 19 + shadcn/ReUI chrome, deck.gl 9.2 / luma.gl 9.2, Viv 0.22 (`@hms-dbmi/viv`), zarrita, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-25-landmarks-inspect-cube-design.md`

## Global Constraints

- New synced traits on `LandmarksWidget`: exactly `volume` (Dict), `volume_label_ids` (Unicode, base64 int32, one per cell, 0 = no label), `volume_cut` (List of 6 floats: x0, x1, y0, y1, z0, z1 in µm). Nothing else new is synced.
- Client-local (never traits): cube open/closed and position, camera preset, additive/MIP, palette, Labels switch, live contrast, image alpha, image gamma, cell alpha, side-panel collapse state.
- Image element name in the colon A2 SpatialData: `mosaic` (`images/mosaic`, `c, z, y, x`). The cube shows channel 0.
- Palette options: gray (default), inferno, magma, viridis, cividis. Cell colours come from the category palette only.
- Image: `v = pow(contrast(v), gamma)`, per-sample opacity `v * alpha`, colour from the palette at `v`. Gamma range 0.2–5 (log slider), alpha 0–1.
- Cells: per-sample opacity `alpha * a` (`a` = lookup fill or outline alpha). No cell gamma.
- Every sampler in the raycast is a `sampler3D`; a shader module never shares a sampler's name (luma.gl constraints found in `cell-lut-extension.ts`).
- Lookup textures are at most 2048 wide (3D texture axis limit).
- Toolbar order: `select · hand · inspect · probe · node | lasso ▾ · landmark ▾ | + · − · reset | full screen`. Inspect icon: lucide `BoxIcon`.
- Shortcuts: `I` Inspect (existing), `Esc` in Inspect closes the cube, `[` / `]` toggle left / right panel.
- `LandmarksWidget(adata)` and `VolumeCubeWidget` keep working unchanged.
- Widget chrome uses shadcn/ReUI primitives from `frontend/src/components/ui/` (AGENTS.md).
- Windows: run npm scripts that use `VAR=x` with `export npm_config_script_shell="C:/Program Files/Git/bin/bash.exe"`; build a single widget with `SPATIAL_RX_BUILD_WIDGET=<name> npx vite build` from `frontend/`; build `landmarks` last (it rewrites the shared `widgets.css`).

## File Structure

| File | Responsibility |
| --- | --- |
| `spatial_rx/volume_source.py` (new) | Resolve table / labels / image / frame from a SpatialData; `VolumeSource` dataclass; serve the store |
| `spatial_rx/landmarks.py` | Accept `SpatialData`; set `volume*` traits; `volume_cut` default |
| `tests/helpers.py` | `toy_spatialdata(dest)` writer (image, labels, table) |
| `tests/test_volume_source.py` (new) | Inference, overrides, warnings |
| `tests/test_landmarks_volume.py` (new) | Widget traits from a toy SpatialData, trait budget |
| `frontend/src/widgets/volume-cube/cell-lut-extension.ts` | Cube shader: image-only and image+cells, render uniforms, palette texture |
| `frontend/src/widgets/volume-cube/palettes.ts` (new) | Palette stops → 256-entry RGBA lookup |
| `frontend/src/widgets/volume-cube/VolumeCube.tsx` (new) | Props-driven cube: load, level, window, pan, raycast, frame |
| `frontend/src/widgets/volume-cube/VolumeCubeView.tsx` | Standalone widget: traits + `CubeControls` → `VolumeCube` |
| `frontend/src/widgets/landmarks/cube-highlight.ts` (new) | Landmarks state → `HighlightGroup[]` for the window |
| `frontend/src/widgets/landmarks/use-cube-settings.ts` (new) | Client-local cube settings shared by window and toolbar |
| `frontend/src/widgets/landmarks/chrome/cube-window.tsx` (new) | Floating Soft Float window with the 3D view and legend |
| `frontend/src/widgets/landmarks/chrome/inspect-toolbar.tsx` (new) | Context toolbar for Inspect (L1 + L2) |
| `frontend/src/widgets/landmarks/chrome/mode-dropdown.tsx` (new) | Shared lasso / landmark dropdown button |
| `frontend/src/widgets/landmarks/chrome/topbar.tsx` | New order, two dropdowns |
| `frontend/src/widgets/landmarks/chrome/primitives.tsx` | Inspect icon, active-hover class |
| `frontend/src/widgets/landmarks/chrome/panel-peek.tsx` (new) | Collapse button + peek tab |
| `frontend/src/widgets/landmarks/LandmarksView.tsx` | Wire cube window, inspect toolbar, panel collapse |
| `frontend/src/widgets/landmarks/landmarks.css` | Collapsed dock and peek tab styles |
| `frontend/src/widgets/landmarks/helpers.ts` | Mode order |
| `frontend/src/widgets/landmarks/engine.d.ts` | New engine methods |
| `spatial_rx/static/landmarks.js` | Hover square, place/drag events, Esc close, window visibility |
| `frontend/dev/landmarks-volume/` (renamed from `notebook-link/`) | Harness: Landmarks with a toy volume |
| `frontend/dev/export-landmarks-volume-fixture.py` (renamed from `export-volume-cube-fixture.py`) | Writes toy SpatialData + fixture JSON |
| `frontend/e2e/landmarks/landmarks-volume.spec.ts` (new; replaces `e2e/volume-cube/notebook-link.spec.ts`) | Inspect cube e2e |
| `frontend/e2e/landmarks/landmarks.spec.ts` | Toolbar and panel e2e |
| `docs/adr/0006-landmarks-hosts-volume-cube.md` (new), `AGENTS.md`, feature maps | Docs |
| `D:\clarence\pyxa_scverse_demo\build_colon_a2.py`, `colon_a2.py`, `README.md` | Mosaic into SpatialData; one-line notebook |

---

### Task 1: Toy SpatialData and volume inference

**Files:**
- Create: `spatial_rx/volume_source.py`
- Modify: `tests/helpers.py`
- Test: `tests/test_volume_source.py`

**Interfaces:**
- Consumes: `spatial_rx.volume_cube.toy_volumes()` → `(image uint8 zyx, labels uint8 zyx)`; `spatial_rx.volume_cube.serve_directory(path) -> (server, base_url)`.
- Produces:
  - `tests.helpers.toy_spatialdata(dest: Path) -> SpatialData` (on disk at `dest`, elements `images/mosaic`, `labels/cells`, table `table` with `obs["cell_type"]`, `obs["cell_id"]` = instance key, `obsm["spatial"]` (n, 3) µm).
  - `spatial_rx.volume_source.VolumeSource` dataclass: `table_name: str`, `image: str | None`, `labels: str | None`, `root: Path`, `voxel_size_um: tuple[float, float, float]`, `origin_um: tuple[float, float, float]`, `shape_zyx: tuple[int, int, int]`, `label_ids: np.ndarray | None` (int32, table order).
  - `resolve_volume(sdata, *, table=None, image=None, labels=None) -> tuple[AnnData, VolumeSource | None]` (warns and returns `None` source when the cube is not possible).

- [ ] **Step 1: Toy SpatialData helper**

Append to `tests/helpers.py`:

```python
def toy_spatialdata(dest):
    """On-disk SpatialData on the toy volume grid: image, labels, table (1 µm voxels)."""
    import anndata as ad
    import numpy as np
    import pandas as pd
    import spatialdata as sd
    from spatialdata.models import Image3DModel, Labels3DModel, TableModel
    from spatialdata.transformations import Identity

    from spatial_rx.volume_cube import toy_volumes

    image, labels = toy_volumes()
    ids = np.unique(labels)
    ids = ids[ids > 0]
    centroids = []
    for i in ids:
        zz, yy, xx = np.nonzero(labels == i)
        centroids.append([xx.mean(), yy.mean(), zz.mean()])
    obs = pd.DataFrame(
        {
            "cell_type": pd.Categorical([f"type{i % 2}" for i in ids]),
            "cell_id": ids.astype(int),
            "region": pd.Categorical(["cells"] * len(ids)),
        },
        index=[f"cell{i}" for i in ids],
    )
    table = ad.AnnData(np.ones((len(ids), 1), dtype=np.float32), obs=obs)
    table.obsm["spatial"] = np.asarray(centroids, dtype=float)
    sdata = sd.SpatialData(
        images={
            "mosaic": Image3DModel.parse(
                image[None], dims=("c", "z", "y", "x"), transformations={"global": Identity()}
            )
        },
        labels={
            "cells": Labels3DModel.parse(
                labels.astype(np.uint32), dims=("z", "y", "x"), transformations={"global": Identity()}
            )
        },
        tables={"table": TableModel.parse(table, region="cells", region_key="region", instance_key="cell_id")},
    )
    sdata.write(dest)
    return sd.read_zarr(dest)
```

- [ ] **Step 2: Write the failing tests**

Create `tests/test_volume_source.py`:

```python
import numpy as np
import pytest

pytest.importorskip("spatialdata")

from spatial_rx.volume_source import resolve_volume
from tests.helpers import toy_spatialdata


@pytest.fixture
def sdata(tmp_path):
    return toy_spatialdata(tmp_path / "toy.zarr")


def test_infers_table_labels_image_and_frame(sdata):
    adata, src = resolve_volume(sdata)
    assert adata is sdata.tables["table"]
    assert src.image == "mosaic"
    assert src.labels == "cells"
    assert src.shape_zyx == (64, 256, 256)
    assert src.voxel_size_um == (1.0, 1.0, 1.0)
    assert src.origin_um == (0.0, 0.0, 0.0)
    np.testing.assert_array_equal(src.label_ids, adata.obs["cell_id"].to_numpy())
    assert src.label_ids.dtype == np.int32


def test_overrides_and_opt_out(sdata):
    _, src = resolve_volume(sdata, labels="cells", image="mosaic", table="table")
    assert src.image == "mosaic"
    with pytest.warns(UserWarning, match="no 3D image"):
        _, none = resolve_volume(sdata, image=False)
    assert none is None


def test_in_memory_sdata_has_no_cube(sdata):
    import spatialdata as sd

    mem = sd.SpatialData(images=dict(sdata.images), labels=dict(sdata.labels), tables=dict(sdata.tables))
    with pytest.warns(UserWarning, match="not backed"):
        adata, src = resolve_volume(mem)
    assert src is None and adata.n_obs == sdata.tables["table"].n_obs


def test_several_tables_need_a_name(sdata):
    sdata.tables["other"] = sdata.tables["table"].copy()
    with pytest.raises(ValueError, match="table="):
        resolve_volume(sdata)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/test_volume_source.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'spatial_rx.volume_source'`

- [ ] **Step 4: Implement `spatial_rx/volume_source.py`**

```python
"""Find what the Landmarks cube needs in a SpatialData: table, labels, 3D image, frame.

The table's ``spatialdata_attrs`` name the labels element it annotates and the
``obs`` column holding each cell's label id. The image is the 3D image in the
same coordinate system on the labels' grid (else the only 3D image there). The
frame comes from the element's transform to that coordinate system, so window
coordinates and ``obsm["spatial"]`` share units (µm for Pyxa / Meteor).
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass(frozen=True)
class VolumeSource:
    table_name: str
    image: str | None
    labels: str | None
    root: Path
    voxel_size_um: tuple[float, float, float]
    origin_um: tuple[float, float, float]
    shape_zyx: tuple[int, int, int]
    label_ids: np.ndarray | None


def _level0(element: Any):
    """Level-0 DataArray of a single- or multi-scale element."""
    if hasattr(element, "children") and "scale0" in element.children:
        return next(iter(element["scale0"].values()))
    return element


def _frame(element: Any, cs: str) -> tuple[tuple[float, ...], tuple[float, ...], tuple[int, ...]]:
    from spatialdata.transformations import get_transformation

    arr = _level0(element)
    shape = tuple(int(arr.sizes[a]) for a in ("z", "y", "x"))
    affine = get_transformation(element, to_coordinate_system=cs).to_affine_matrix(
        input_axes=("z", "y", "x"), output_axes=("z", "y", "x")
    )
    if not np.allclose(affine[:3, :3], np.diag(np.diag(affine[:3, :3]))):
        raise ValueError("the cube supports scale + translation transforms only")
    scale = tuple(float(v) for v in np.diag(affine[:3, :3]))
    origin = tuple(float(v) for v in affine[:3, 3])
    return scale, origin, shape


def _pick_table(sdata: Any, table: str | None) -> str:
    if table is not None:
        return table
    names = list(sdata.tables)
    if len(names) == 1:
        return names[0]
    linked = [n for n in names if sdata.tables[n].uns.get("spatialdata_attrs", {}).get("region") in sdata.labels]
    if len(linked) == 1:
        return linked[0]
    raise ValueError(f"several tables {names}: pass table=<name>")


def resolve_volume(
    sdata: Any,
    *,
    table: str | None = None,
    image: str | bool | None = None,
    labels: str | bool | None = None,
) -> tuple[Any, VolumeSource | None]:
    """The table to plot and, when the cube is possible, its volume source.

    ``image`` / ``labels``: an element name, ``None`` to infer, or ``False`` to
    leave it out. Warns (and returns no source) when there is no 3D image or the
    SpatialData is not backed by a Zarr store on disk.
    """
    table_name = _pick_table(sdata, table)
    adata = sdata.tables[table_name]
    attrs = adata.uns.get("spatialdata_attrs", {})
    cs = "global"

    labels_name = None
    if labels is not False:
        region = labels if isinstance(labels, str) else attrs.get("region")
        if isinstance(region, str) and region in sdata.labels:
            labels_name = region
    if labels_name is not None:
        from spatialdata.transformations import get_transformation

        cs = next(iter(get_transformation(sdata.labels[labels_name], get_all=True)))

    image_name = None
    if image is not False:
        if isinstance(image, str):
            image_name = image
        else:
            images3d = [n for n, e in sdata.images.items() if "z" in _level0(e).dims]
            if labels_name is not None:
                target = _frame(sdata.labels[labels_name], cs)
                aligned = [n for n in images3d if _frame(sdata.images[n], cs) == target]
                image_name = (aligned or images3d or [None])[0]
            elif len(images3d) == 1:
                image_name = images3d[0]
    if image_name is None:
        warnings.warn("no 3D image in this SpatialData: Landmarks has no cube", UserWarning, stacklevel=3)
        return adata, None
    if getattr(sdata, "path", None) is None:
        warnings.warn("SpatialData is not backed by a Zarr store on disk: no cube", UserWarning, stacklevel=3)
        return adata, None

    voxel, origin, shape = _frame(sdata.images[image_name], cs)
    if labels_name is not None and _frame(sdata.labels[labels_name], cs) != (voxel, origin, shape):
        warnings.warn(f"labels {labels_name!r} are on another grid than {image_name!r}: cube shows the image only",
                      UserWarning, stacklevel=3)
        labels_name = None
    label_ids = None
    if labels_name is not None and attrs.get("instance_key") in adata.obs:
        label_ids = adata.obs[attrs["instance_key"]].to_numpy().astype(np.int32)
    return adata, VolumeSource(table_name, image_name, labels_name, Path(sdata.path), voxel, origin, shape, label_ids)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_volume_source.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add spatial_rx/volume_source.py tests/helpers.py tests/test_volume_source.py
git commit -m "feat: infer the cube's table, labels, image and frame from SpatialData"
```

---

### Task 2: `LandmarksWidget(sdata)` and the three traits

**Files:**
- Modify: `spatial_rx/landmarks.py` (constructor signature near line 398, trait block near line 300)
- Test: `tests/test_landmarks_volume.py`

**Interfaces:**
- Consumes: `resolve_volume`, `VolumeSource` (Task 1), `serve_directory` (`spatial_rx/volume_cube.py`).
- Produces: traits `volume: Dict` with keys exactly `image_url`, `labels_url`, `voxel_size_um`, `origin_um`, `contrast_limits`; `volume_label_ids: Unicode`; `volume_cut: List(Float, 6)`. Constructor `LandmarksWidget(data: AnnData | SpatialData, *, table=None, image=None, labels=None, contrast_limits=None, spatial_key="spatial", color=None, genes=None)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_landmarks_volume.py`:

```python
import base64
from urllib.request import urlopen

import numpy as np
import pytest

pytest.importorskip("spatialdata")

from spatial_rx import LandmarksWidget
from tests.helpers import toy_spatialdata

NEW_TRAITS = {"volume", "volume_label_ids", "volume_cut"}


@pytest.fixture
def sdata(tmp_path):
    return toy_spatialdata(tmp_path / "toy.zarr")


def test_widget_from_sdata_serves_the_volume(sdata):
    w = LandmarksWidget(sdata, color="cell_type")
    assert set(w.volume) == {"image_url", "labels_url", "voxel_size_um", "origin_um", "contrast_limits"}
    assert w.volume["voxel_size_um"] == [1.0, 1.0, 1.0]
    assert w.volume["image_url"].endswith("/images/mosaic/")
    assert w.volume["labels_url"].endswith("/labels/cells/")
    with urlopen(w.volume["image_url"] + "zarr.json") as r:  # served, NGFF metadata
        assert r.status == 200
    ids = np.frombuffer(base64.b64decode(w.volume_label_ids), dtype=np.int32)
    np.testing.assert_array_equal(ids, sdata.tables["table"].obs["cell_id"].to_numpy())
    assert w.volume_cut == [0.0, 256.0, 0.0, 256.0, 0.0, 64.0]


def test_adata_widget_has_empty_volume(sdata):
    w = LandmarksWidget(sdata.tables["table"])
    assert w.volume == {} and w.volume_label_ids == ""


def test_only_three_new_synced_traits():
    synced = {n for n, t in LandmarksWidget.class_traits().items() if t.metadata.get("sync")}
    assert NEW_TRAITS <= synced
    assert not {n for n in synced if n.startswith(("volume", "cube_"))} - NEW_TRAITS
```

If the image's store uses zarr v2 metadata in the installed spatialdata, assert on `.zattrs` instead of `zarr.json` (check `ls <tmp>/toy.zarr/images/mosaic` once).

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_landmarks_volume.py -v`
Expected: FAIL (`LandmarksWidget(adata)` requires an AnnData / missing traits).

- [ ] **Step 3: Implement**

In `spatial_rx/landmarks.py`, add to the trait block (after `raster_status`):

```python
    # 3D cube (LandmarksWidget(sdata)): Python-set config, per-cell label ids, and
    # the cut box the widget writes on slider release. Rendering controls are
    # client-local (ADR 0005 / 0006).
    volume = traitlets.Dict(default_value={}).tag(sync=True)
    volume_label_ids = traitlets.Unicode("").tag(sync=True)  # base64 int32, table order
    volume_cut = traitlets.List(traitlets.Float(), default_value=[]).tag(sync=True)
```

Change the constructor head:

```python
    def __init__(
        self,
        adata: AnnData | Any,
        *,
        spatial_key: str = "spatial",
        color: str | None = None,
        genes: str | list[str] | None = None,
        table: str | None = None,
        image: str | bool | None = None,
        labels: str | bool | None = None,
        contrast_limits: tuple[float, float] | None = None,
    ) -> None:
        """Build from AnnData, or from a SpatialData (cube inferred).

            w = LandmarksWidget(adata, color="cell_type")
            w = LandmarksWidget(sdata)  # table, labels, 3D image and frame inferred
        """
        import numpy as np

        volume_source = None
        if not isinstance(adata, AnnData) and hasattr(adata, "tables"):
            from .volume_source import resolve_volume

            adata, volume_source = resolve_volume(adata, table=table, image=image, labels=labels)
        if not isinstance(adata, AnnData):
            raise TypeError("LandmarksWidget(data) requires an AnnData or a SpatialData")
```

At the end of `__init__` (after `self._pack_embedding_matrix()`):

```python
        self._volume_server = None
        if volume_source is not None:
            self._attach_volume(volume_source, contrast_limits)
```

Add the method:

```python
    def _attach_volume(self, src: Any, contrast_limits: tuple[float, float] | None) -> None:
        from .volume_cube import DEFAULT_CONTRAST_LIMITS, serve_directory

        server, base = serve_directory(src.root)
        self._volume_server = server
        (sz, sy, sx), (oz, oy, ox), (d, h, w) = src.voxel_size_um, src.origin_um, src.shape_zyx
        self.volume = {
            "image_url": f"{base}/images/{src.image}/",
            "labels_url": f"{base}/labels/{src.labels}/" if src.labels else "",
            "voxel_size_um": [sz, sy, sx],
            "origin_um": [oz, oy, ox],
            "contrast_limits": [float(v) for v in (contrast_limits or DEFAULT_CONTRAST_LIMITS)],
        }
        if src.label_ids is not None:
            ids = np.asarray(src.label_ids, dtype=np.int32)
            if ids.size and int(ids.max()) >= 2**22:  # 2048 x 2048 lookup texels
                warnings.warn("label ids above 4,194,303 are not coloured in the cube", UserWarning, stacklevel=3)
            self.volume_label_ids = base64.b64encode(ids.tobytes()).decode("ascii")
        self.volume_cut = [ox, ox + w * sx, oy, oy + h * sy, oz, oz + d * sz]
```

(`import warnings` and `import numpy as np` at module top if not present; `numpy` is already imported locally in `__init__` — import it at module level for the method.)

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_landmarks_volume.py tests/test_landmarks.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add spatial_rx/landmarks.py tests/test_landmarks_volume.py
git commit -m "feat: LandmarksWidget(sdata) serves the inferred volume with three traits"
```

---

### Task 3: Cube shader owns rendering (palette, image alpha/gamma, cell alpha)

**Files:**
- Create: `frontend/src/widgets/volume-cube/palettes.ts`
- Modify: `frontend/src/widgets/volume-cube/cell-lut-extension.ts`
- Modify: `frontend/src/widgets/volume-cube/VolumeCubeView.tsx` (extensions for both channel counts; pass render props)

**Interfaces:**
- Produces:
  - `type PaletteName = "gray" | "inferno" | "magma" | "viridis" | "cividis"`; `PALETTES: PaletteName[]`; `paletteLut(name: PaletteName): { data: Uint8Array; width: 256; height: 1 }`.
  - `type RenderSettings = { palette: PaletteName; imageAlpha: number; imageGamma: number; cellAlpha: number }`; `DEFAULT_RENDER: RenderSettings = { palette: "gray", imageAlpha: 1, imageGamma: 1, cellAlpha: 1 }`.
  - `CUBE_EXTENSIONS: Record<"additive" | "mip", unknown[]>` replacing `CELL_EXTENSIONS` and Viv's stock extensions; layer props `cellLut`, `imagePalette` (`paletteLut(...)`), `render: RenderSettings`.

- [ ] **Step 1: Palettes**

Create `palettes.ts` with 9 sRGB stops per map, linearly interpolated to 256 entries, alpha 255. Gray runs from black to the previous image colour `[220, 225, 230]`:

```ts
export type PaletteName = "gray" | "inferno" | "magma" | "viridis" | "cividis";
export const PALETTES: PaletteName[] = ["gray", "inferno", "magma", "viridis", "cividis"];

const STOPS: Record<PaletteName, string[]> = {
  gray: ["#000000", "#dce1e6"],
  inferno: ["#000004", "#1f0c48", "#550f6d", "#88226a", "#ba3655", "#e35933", "#f98e09", "#f9cb35", "#fcffa4"],
  magma: ["#000004", "#1c1044", "#4f127b", "#812581", "#b5367a", "#e55064", "#fb8761", "#fec287", "#fcfdbf"],
  viridis: ["#440154", "#472d7b", "#3b528b", "#2c728e", "#21918c", "#28ae80", "#5ec962", "#addc30", "#fde725"],
  cividis: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8678", "#a59c74", "#c3b369", "#fee838"],
};

const cache = new Map<PaletteName, { data: Uint8Array; width: 256; height: 1 }>();

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 256 RGBA texels in sRGB; the shader linearises before compositing. */
export function paletteLut(name: PaletteName) {
  const hit = cache.get(name);
  if (hit) return hit;
  const stops = STOPS[name].map(rgb);
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(Math.floor(t), stops.length - 2);
    const f = t - k;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(stops[k]![c]! * (1 - f) + stops[k + 1]![c]! * f);
    data[i * 4 + 3] = 255;
  }
  const lut = { data, width: 256 as const, height: 1 as const };
  cache.set(name, lut);
  return lut;
}
```

- [ ] **Step 2: Rewrite the extension around one shader module with uniforms**

In `cell-lut-extension.ts`:
- Module `cubeRender` (name must differ from sampler names) with `uniformTypes: { imageAlpha: "f32", imageGamma: "f32", cellAlpha: "f32" }` and `fs` declaring `uniform cubeRenderUniforms { float imageAlpha; float imageGamma; float cellAlpha; } cubeRender;`, `uniform highp sampler3D cellLut;`, `uniform highp sampler3D imagePalette;`, plus:

```glsl
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
// Image value after contrast -> (linear rgb, per-sample alpha).
vec4 imageSample(float v) {
  float g = pow(clamp(v, 0.0, 1.0), cubeRender.imageGamma);
  vec3 c = srgbToLinear(texelFetch(imagePalette, ivec3(int(g * 255.0 + 0.5), 0, 0), 0).rgb);
  return vec4(c, g * cubeRender.imageAlpha);
}
```

- `cellColor` stays; multiply its returned alpha by `cubeRender.cellAlpha`.
- Rendering blocks: additive and MIP, each guarded so the image-only case (1 channel) compiles: wrap every `volume1` / `cellSize` / `cellColor` line in `#if NUM_CHANNELS > 1 … #endif` (Viv defines `NUM_CHANNELS`). Additive per step: composite `cell` first (as now), then `vec4 im = imageSample(intensityValue0); color.rgb += (1.0 - color.a) * im.a * im.rgb; color.a += (1.0 - color.a) * im.a;`. MIP: track `maxImage`; after the loop `vec4 im = imageSample(maxImage); color = vec4(cells.rgb + (1.0 - cells.a) * im.rgb * im.a, 1.0);` (cells block only when `NUM_CHANNELS > 1`).
- Extension `updateState`: create/replace `cellLutTexture` (as now) and `paletteTexture` from `props.imagePalette` (3D, 256×1×1, rgba8unorm, nearest) when the object identity changes.
- Extension `draw`: `model.setBindings({ cellLut, imagePalette })` and `model.shaderInputs.setProps({ cubeRender: props.render ?? DEFAULT_RENDER })`.
- Export `CUBE_EXTENSIONS = { additive: [new CubeAdditiveExtension()], mip: [new CubeMipExtension()] }` (two classes, as now, so deck.gl recompiles on a mode switch).

- [ ] **Step 3: Use it in `VolumeCubeView.tsx`**

Replace `extensions: hasCells ? CELL_EXTENSIONS[mode] : EXTENSIONS[mode]` with `extensions: CUBE_EXTENSIONS[mode]`, add `imagePalette: paletteLut(DEFAULT_RENDER.palette)` and `render: DEFAULT_RENDER` to the layer props, and delete the Viv `EXTENSIONS` map and the `ColorPalette3DExtensions` import if unused. `colors` no longer matters for channel 0; keep it for Viv's prop validation.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit -p . && export npm_config_script_shell="C:/Program Files/Git/bin/bash.exe" && npm run test:e2e:volume-cube`
Expected: typecheck clean; 9 + 2 passed. Then open the volume-cube harness (`npm run dev:volume-cube`), confirm the toy renders like before with Labels on and off, and the browser console has no luma.gl validation error (use `window.__volumeCubeModel` to set `highlight_groups` as in the e2e).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/widgets/volume-cube
git commit -m "feat(volume-cube): cube shader with palettes, image alpha/gamma and cell alpha"
```

---

### Task 4: Split a props-driven `VolumeCube` out of `VolumeCubeView`

**Files:**
- Create: `frontend/src/widgets/volume-cube/VolumeCube.tsx`
- Modify: `frontend/src/widgets/volume-cube/VolumeCubeView.tsx`

**Interfaces:**
- Consumes: `RenderSettings`, `CUBE_EXTENSIONS`, `paletteLut` (Task 3); `HighlightGroup`, `buildCellLut`, `EMPTY_CELL_LUT`.
- Produces:

```ts
export type CubeCut = [number, number, number, number, number, number]; // x0,x1,y0,y1,z0,z1 µm
export type VolumeCubeProps = {
  imageUrl: string;
  labelsUrl: string;
  voxelSizeUm: [number, number, number];   // z, y, x
  originUm: [number, number, number];
  windowCx: number;
  windowCy: number;
  windowSizeUm: number;
  cut: CubeCut;                             // shown cut (already the live value)
  contrast: [number, number];
  mode: "additive" | "mip";
  preset: ViewPreset | null;                // applied when it changes
  resetTick: number;                        // bump to reset the camera
  showLabels: boolean;
  groups: HighlightGroup[];
  render: RenderSettings;
  dark: boolean;
  height?: number | string;                 // default 520
  onLoadState?: (s: { labels: "off" | "loading" | "on" | "error"; channels: 1 | 2; pan: [number, number]; level: number }) => void;
  onBounds?: (b: { winX: [number, number]; winY: [number, number]; stackZ: [number, number]; contrastMax: number }) => void;
  onPreset?: (p: ViewPreset | null) => void; // camera matches a preset (or none after orbiting)
};
export function VolumeCube(props: VolumeCubeProps): JSX.Element;
```

- [ ] **Step 1: Move the rendering half**

Move from `VolumeCubeView.tsx` into `VolumeCube.tsx`: the image/labels loading effects, level picking, `windowVoxels` / `liveBox` / `loaded` pan logic, loaders, `cellLut`, slices, `aimTarget`, `fit`, view state and presets, `layerProps`, `VivViewer`, the status line and the legend badges. Convert trait reads to props. `labelsWanted` stays sticky inside the component. The container keeps the `data-labels`, `data-channels`, `data-highlight`, `data-render`, `data-pan` attributes on its root `div` with class `volume-cube__view`.

- [ ] **Step 2: Standalone widget becomes a binder**

`VolumeCubeView` keeps `useModel`, the live-range mirrors, the X/Y follow effect, `CubeControls`, the readout line and the outer `.spatial-rx-widget.volume-cube` root; it passes `cut` from the live ranges, `groups` from `highlight_groups`, `render={DEFAULT_RENDER}`, and mirrors `onLoadState` into the same `data-*` attributes on its root (the e2e reads them there).

- [ ] **Step 3: Verify no behaviour change**

Run: `cd frontend && npx tsc --noEmit -p . && npm run test:e2e:volume-cube`
Expected: 9 + 2 passed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/widgets/volume-cube
git commit -m "refactor(volume-cube): props-driven VolumeCube shared by widgets"
```

---

### Task 5: Engine: hover square, place/drag, Esc, window visibility

**Files:**
- Modify: `spatial_rx/static/landmarks.js` (`setVolumeWindow` / `buildVolumeWindowLayer` near line 3467, `handleMouseDown` near 4758, mouse move near 4920, Escape near 5380, returned handle object)
- Modify: `frontend/src/widgets/landmarks/engine.d.ts`

**Interfaces:**
- Produces on `EngineHandle`:

```ts
  /** Inspect placements: "place" on pointer down / drag, "close" on Esc in Inspect. */
  subscribeInspect(fn: (evt: { type: "place" | "close"; x?: number; y?: number }) => void): () => void;
  /** Keep the placed square drawn outside Inspect while the cube is open. */
  setInspectWindowVisible(visible: boolean): void;
  /** Test probe: { hover: [x, y] | null, placed: [x, y] | null }. */
  getInspectOverlay(): { hover: number[] | null; placed: number[] | null };
```

- [ ] **Step 1: State and layer**

Add `let volumeHover = null; let volumeWindowVisible = false; const inspectListeners = new Set();` next to `volumeWindow`. `buildVolumeWindowLayer` returns up to two layers: the placed square when `volumeWindow && (currentMode === "inspect" || volumeWindowVisible)`, and, in Inspect only, a hover square at `volumeHover` (fill `[37,99,235,20]`, line `[37,99,235,160]`, width 1.5). Build both rings with the existing ring code (extract `windowRing(x, y)`), and return an array; update the caller to spread it (`...buildVolumeWindowLayers()`).

- [ ] **Step 2: Events**

- In the Inspect branch of the mouse-move handler: when `event.buttons === 0`, set `volumeHover = pt` and `setDeckLayers()` with no model writes; when dragging, keep `setVolumeWindow(pt.x, pt.y, false)` and emit `{ type: "place", x, y }`.
- In `handleMouseDown` Inspect branch, after `setVolumeWindow(..., true)`, emit `{ type: "place", x: pt.x, y: pt.y }`.
- On `mouseleave` of the canvas: `volumeHover = null; setDeckLayers();`.
- In the Escape handler, before `resetDraft()`: `if (currentMode === "inspect") { volumeHover = null; emitInspect({ type: "close" }); setDeckLayers(); return; }`.
- `setVolumeWindow` throttle stays (40 ms); the cube pans from the local trait change immediately.

- [ ] **Step 3: Handle methods**

```js
    subscribeInspect(fn) { inspectListeners.add(fn); return () => inspectListeners.delete(fn); },
    setInspectWindowVisible(v) { volumeWindowVisible = Boolean(v); setDeckLayers(); },
    getInspectOverlay() {
      return {
        hover: volumeHover ? [volumeHover.x, volumeHover.y] : null,
        placed: volumeWindow ? [volumeWindow.x, volumeWindow.y] : null,
      };
    },
```

with `function emitInspect(evt) { for (const fn of inspectListeners) fn(evt); }`. Mirror the signatures in `engine.d.ts`.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit -p . && npm run test:e2e:landmarks`
Expected: all pass (behaviour outside Inspect unchanged).

- [ ] **Step 5: Commit**

```bash
git add spatial_rx/static/landmarks.js frontend/src/widgets/landmarks/engine.d.ts
git commit -m "feat(landmarks): inspect hover square and placement events"
```

---

### Task 6: Highlight groups from Landmarks state

**Files:**
- Create: `frontend/src/widgets/landmarks/cube-highlight.ts`

**Interfaces:**
- Consumes: `decodeF32Base64`, `decodeI32Base64` (`binary.ts`); `HighlightGroup` (`volume-cube/cell-lut-extension.ts`).
- Produces:

```ts
export type CubeHighlightInput = {
  points: Float32Array;          // points_data decoded: [nx, ny, valueA, _] per cell
  xBounds: number[]; yBounds: number[];
  labelIds: Int32Array | null;   // volume_label_ids decoded
  codes: Int32Array | null;      // category_codes decoded (column-major)
  columns: { name: string; labels: string[]; palette: string[] }[];
  activeCategory: string;
  colorBy: string;               // "categorical" | "continuous"
  focus: { kind: string; index: number };
  selections: { point_indices?: number[]; polygon?: number[][]; vertices?: number[][]; hidden?: boolean }[];
  window: { cx: number; cy: number; size: number } | null;
};
export function cubeHighlightGroups(input: CubeHighlightInput): HighlightGroup[];
```

- [ ] **Step 1: Implement**

```ts
import type { HighlightGroup } from "@/widgets/volume-cube/cell-lut-extension";

const MARGIN_UM = 10;

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!; const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

/**
 * Cells the cube fills, grouped by category, for the cells near the window:
 * nothing focused -> every cell; a category -> its cells; a Selection -> its
 * cells, by category. Continuous colour-by -> none (outlines only).
 */
export function cubeHighlightGroups(input: CubeHighlightInput): HighlightGroup[] {
  const { points, labelIds, codes, columns, window: win } = input;
  const n = Math.floor(points.length / 4);
  const col = columns.findIndex((c) => c.name === input.activeCategory);
  if (!labelIds || !codes || col < 0 || input.colorBy !== "categorical" || !win || labelIds.length !== n) return [];
  const { labels, palette } = columns[col]!;
  const [x0, x1] = input.xBounds; const [y0, y1] = input.yBounds;
  const half = win.size / 2 + MARGIN_UM;
  let member: ((i: number) => boolean) | null = null;
  if (input.focus.kind === "type" && input.focus.index >= 0) {
    member = (i) => codes[col * n + i] === input.focus.index;
  } else if (input.focus.kind === "selection") {
    const sel = input.selections[input.focus.index];
    if (!sel || sel.hidden) return [];
    if (sel.point_indices?.length) {
      const set = new Set(sel.point_indices);
      member = (i) => set.has(i);
    } else {
      const ring = sel.polygon ?? sel.vertices ?? [];
      member = (i) => inRing(x0! + ((points[i * 4]! + 1) / 2) * (x1! - x0!), y0! + ((points[i * 4 + 1]! + 1) / 2) * (y1! - y0!), ring);
    }
  }
  const byCode = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const x = x0! + ((points[i * 4]! + 1) / 2) * (x1! - x0!);
    const y = y0! + ((points[i * 4 + 1]! + 1) / 2) * (y1! - y0!);
    if (Math.abs(x - win.cx) > half || Math.abs(y - win.cy) > half) continue;
    const id = labelIds[i]!;
    if (id <= 0 || (member && !member(i))) continue;
    const code = codes[col * n + i]!;
    let ids = byCode.get(code);
    if (!ids) byCode.set(code, (ids = []));
    ids.push(id);
  }
  return [...byCode.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([code, ids]) => ({ name: labels[code] ?? String(code), color: palette[code % palette.length] ?? "#22d3ee", labels: ids }));
}
```

Before relying on `sel.polygon` / `sel.vertices`, check the selection dict keys in `landmarks.js` `selectionPolygonData` and use the same key; commits made in the UI store `point_indices`, so the polygon branch is the fallback for Python-created selections.

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: clean. (Behaviour is proven by the Task 7 e2e.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/widgets/landmarks/cube-highlight.ts
git commit -m "feat(landmarks): cube highlight groups from focus and category"
```

---

### Task 7: Cube window and Inspect toolbar in Landmarks, with harness and e2e

**Files:**
- Create: `frontend/src/widgets/landmarks/use-cube-settings.ts`, `chrome/cube-window.tsx`, `chrome/inspect-toolbar.tsx`
- Modify: `frontend/src/widgets/landmarks/LandmarksView.tsx`, `chrome/index.ts`, `use-landmarks-model.ts` (add `volume`, `volume_label_ids`, `volume_cut`, `inspect_cx`, `inspect_cy`, `inspect_size_um` to the state keys and `LandmarksState`), `landmarks.css`
- Rename: `frontend/dev/notebook-link/` → `frontend/dev/landmarks-volume/`; `frontend/dev/export-volume-cube-fixture.py` → `frontend/dev/export-landmarks-volume-fixture.py`; fixture `frontend/dev/volume-cube-fixture.json` → `frontend/dev/landmarks-volume-fixture.json`
- Modify: `frontend/vite.config.ts` (`notebook-link` → `landmarks-volume`, public dir `dev/landmarks-volume/public`), `frontend/package.json` (`dev:landmarks-volume`; `test:e2e:landmarks` also runs the new spec with `E2E_HARNESS=landmarks-volume`), `frontend/playwright.config.ts` (harness key), `frontend/e2e/helpers.ts` (`bootLandmarksVolumeHarness`)
- Delete: `frontend/e2e/volume-cube/notebook-link.spec.ts`
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Consumes: `VolumeCube`, `VolumeCubeProps`, `CubeCut` (Task 4); `RenderSettings`, `PALETTES` (Task 3); `EngineHandle.subscribeInspect`, `setInspectWindowVisible` (Task 5); `cubeHighlightGroups` (Task 6).
- Produces:

```ts
// use-cube-settings.ts
export type CubeSettings = {
  open: boolean; mode: "additive" | "mip"; preset: ViewPreset | null; resetTick: number;
  showLabels: boolean; render: RenderSettings; contrast: [number, number];
  cut: CubeCut; bounds: { winX: [number, number]; winY: [number, number]; stackZ: [number, number]; contrastMax: number } | null;
};
export function useCubeSettings(initialContrast: [number, number], initialCut: CubeCut): [CubeSettings, (patch: Partial<CubeSettings>) => void];
```

`CubeWindow({ lm, settings, patch, dark, groups })` and `InspectToolbar({ settings, patch, onCommitCut })`.

- [ ] **Step 1: Harness first (fixture from a toy SpatialData)**

`export-landmarks-volume-fixture.py`: build `sdata = toy_spatialdata(<dev>/landmarks-volume/public/toy.sdata.zarr)` (delete and rewrite each run), `w = LandmarksWidget(sdata, color="cell_type")`, dump `FIXTURE_KEYS + ["volume", "volume_label_ids", "volume_cut", "inspect_size_um"]` to `landmarks-volume-fixture.json`, rewriting `volume.image_url` / `labels_url` to `/toy.sdata.zarr/images/mosaic/` and `/toy.sdata.zarr/labels/cells/` (served by Vite's public dir). Set `inspect_size_um = 100`. Run it: `uv run python frontend/dev/export-landmarks-volume-fixture.py`. `dev/landmarks-volume/main.tsx` renders only `LandmarksView` over the fixture model and exposes `window.__landmarksModel`.

- [ ] **Step 2: Write the failing e2e**

`frontend/e2e/landmarks/landmarks-volume.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { bootLandmarksVolumeHarness, canvasBox, getModel, setModel } from "../helpers";

const cubeWindow = (page) => page.getByRole("dialog", { name: "Cube" });

test.describe("Landmarks inspect cube", () => {
  test.beforeEach(async ({ page }) => bootLandmarksVolumeHarness(page));

  test("hover shows the window square without model writes; click opens the cube", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const overlay = await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay());
    expect(overlay.hover).not.toBeNull();
    expect(await getModel(page, "inspect_cx")).toBeNull();
    await expect(cubeWindow(page)).toHaveCount(0);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    await expect(cubeWindow(page).locator(".volume-cube__view")).toHaveAttribute("data-channels", /1|2/);
  });

  test("drag pans the cube; Esc closes it", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-pan", "0,0");
    await view.evaluate((el) => {
      const seen: string[] = []; (window as any).__pans = seen;
      new MutationObserver(() => seen.push(el.getAttribute("data-pan") ?? "")).observe(el, { attributes: true, attributeFilter: ["data-pan"] });
    });
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.5, { steps: 4 });
    await page.mouse.up();
    await expect(view).toHaveAttribute("data-pan", "0,0");
    expect((await page.evaluate(() => (window as any).__pans)).some((p: string) => p !== "0,0")).toBe(true);
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("inspect toolbar: presets, MIP, palette, alpha/gamma, committed Z cut", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const bar = page.getByTestId("context-inspect-toolbar");
    const view = cubeWindow(page).locator(".volume-cube__view");
    await bar.getByRole("radio", { name: "Maximum intensity" }).click();
    await expect(view).toHaveAttribute("data-render", "mip");
    await bar.getByRole("button", { name: "Palette" }).click();
    await page.getByRole("menuitemradio", { name: "viridis" }).click();
    await expect(view).toHaveAttribute("data-palette", "viridis");
    await bar.getByRole("button", { name: "Image" }).click();
    const gamma = page.getByRole("slider", { name: "Image gamma" });
    await gamma.focus(); await page.keyboard.press("ArrowRight");
    await expect(view).not.toHaveAttribute("data-image-gamma", "1");
    await expect(view).toHaveAttribute("data-channels", /1|2/); // no refetch needed for uniforms
    await bar.getByRole("button", { name: "Cuts" }).click();
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await zHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => ((await getModel(page, "volume_cut")) as number[])[5]).toBe(54);
  });

  test("highlight follows focus: everything, a category, a Selection", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const bar = page.getByTestId("context-inspect-toolbar");
    await bar.getByRole("switch", { name: "Labels" }).click();
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(view).toHaveAttribute("data-highlight", "2"); // type0, type1 in the window
    await setModel(page, { selected_kind: "type", selected_index: 0 });
    await expect(view).toHaveAttribute("data-highlight", "1");
    await setModel(page, { selected_kind: "", selected_index: -1 });
    await expect(view).toHaveAttribute("data-highlight", "2");
  });
});
```

Check the toy table's cell positions against the window at the canvas centre when writing: the toy has three blobs (labels 1–3, centres near (70, 80), (160, 150), (100, 190) µm), so a 100 µm window at the tissue centre (128, 128) covers types from blobs 2 and 3; adjust the expected counts if the export's window centre differs.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts`
Expected: FAIL (no Cube dialog).

- [ ] **Step 4: `use-cube-settings.ts`**

A `useReducer`-free `useState` wrapper: initial `{ open: false, mode: "additive", preset: "iso", resetTick: 0, showLabels: false, render: DEFAULT_RENDER, contrast: initialContrast, cut: initialCut, bounds: null }`, `patch` merges shallowly (`render` merges one level deeper when given `{ render: { imageGamma } }`).

- [ ] **Step 5: `chrome/cube-window.tsx`**

- Root: `<section role="dialog" aria-label="Cube" className={cn(FLOAT_PANEL, "landmarks__cube-window pointer-events-auto absolute flex flex-col")} style={{ left, top, width, height }}>`; default 440×380 px, top 56 px, right 16 px inside the widget; drag by the title bar (pointer capture, clamp to the widget root's rect); resize from a bottom-right handle (min 320×280).
- Title bar: "Cube · {size} µm" and a close `Button` (`aria-label="Close cube"`, lucide `XIcon`) → `patch({ open: false })`.
- Body: `React.lazy(() => import("@/widgets/volume-cube/VolumeCube"))` inside `<Suspense>` so the plain Landmarks harness never loads Viv. Props from `lm.volume` (URLs, frame), `lm.inspect_cx/cy/size`, `settings` (cut, contrast, mode, preset, resetTick, showLabels, render), `groups`, `dark`, `height="100%"`; `onBounds` → `patch({ bounds })`; `onPreset` → `patch({ preset })`.
- Also put `data-palette`, `data-image-gamma` on the `VolumeCube` root (add to Task 4's component: `data-palette={render.palette}` and `data-image-gamma={render.imageGamma}`).
- `stopPropagation` on mouse down / wheel so the map does not pan under it.

- [ ] **Step 6: `chrome/inspect-toolbar.tsx`**

Same shell as `SelectionToolbar` (`landmarks__chrome-context`, `pillClass`, `ToolStack` for L2 — export `ToolStack`, `IconBtn`, `pillClass` from `selection-toolbar.tsx` rather than copying them), `data-testid="context-inspect-toolbar"`:
- L1: `ToggleGroup` Top / Iso / Side (`aria-label`s "Top view", "Oblique view", "Side view") → `patch({ preset })`; `ToggleGroup` Additive / MIP ("Additive", "Maximum intensity"); a `DropdownMenu` button `aria-label="Palette"` with `DropdownMenuRadioGroup` items for `PALETTES` (each shows a small gradient swatch); `Switch` `aria-label="Labels"` (disabled when `!lm.volume.labels_url`); openers `Cuts`, `Image`, `Cells` (L2 `ToolStack`s, one open at a time); `Reset` → `patch({ resetTick: settings.resetTick + 1 })`.
- L2 **Cuts:** three range `Slider`s (`aria-label` "X cut", "Y cut", "Z cut", `className` as `CubeControls`' `RangeControl`) over `settings.bounds`, live `onValueChange` → `patch({ cut })`, `onValueCommit` → `onCommitCut(cut)`; reuse `RangeControl` by exporting it from `CubeControls.tsx`.
- L2 **Image:** Contrast range (0…`bounds.contrastMax`), "Image alpha" slider 0–1 step 0.05, "Image gamma" slider over `log2(gamma)` from −2.32 to 2.32 step 0.05 showing `2^v` to two decimals.
- L2 **Cells:** "Cell alpha" slider 0–1 step 0.05.

- [ ] **Step 7: Wire `LandmarksView.tsx`**

- `const hasVolume = Boolean(lm.volume?.image_url)`; `const [cube, patchCube] = useCubeSettings(lm.volume?.contrast_limits ?? [0, 255], lm.volume_cut ?? [0, 0, 0, 0, 0, 0])`.
- `useEffect`: `engine.subscribeInspect((e) => e.type === "place" ? patchCube({ open: true }) : patchCube({ open: false }))` when `hasVolume`; `useEffect(() => engine?.setInspectWindowVisible(cube.open), [engine, cube.open])`.
- `groups = useMemo(() => cubeHighlightGroups({...}), [points_data, x_bounds, y_bounds, volume_label_ids, category_codes, category_columns, active_category, color_by, selected_kind, selected_index, selections, inspect_cx, inspect_cy, inspect_size_um])`, decoding base64 once per string change (`useMemo` on each string).
- Render `{hasVolume && cube.open ? <CubeWindow .../> : null}` inside `.landmarks__chrome`; render `<InspectToolbar/>` instead of `<SelectionToolbar/>` when `lm.mode === "inspect" && cube.open`.
- `onCommitCut(cut)`: `facade.set("volume_cut", cut); facade.save_changes()`.
- Without a volume, Inspect keeps today's behaviour, and the context bar shows a one-line pill "No 3D image in this SpatialData" while in Inspect.

- [ ] **Step 8: Run the e2e and the existing tiers**

Run: `cd frontend && npx tsc --noEmit -p . && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts && npm run test:e2e:landmarks && npm run test:e2e:volume-cube`
Expected: all pass.

- [ ] **Step 9: Build and check the bundle**

Run: `cd frontend && SPATIAL_RX_BUILD_WIDGET=volume-cube npx vite build && SPATIAL_RX_BUILD_WIDGET=landmarks npx vite build && ls -la ../spatial_rx/static/bundled/`
Expected: `landmarks.mjs` grows by roughly the Viv share (~1 MB); note the size in the commit message.

- [ ] **Step 10: Commit**

```bash
git add -A frontend spatial_rx/static
git commit -m "feat(landmarks): Inspect opens a floating cube with its controls in the context toolbar"
```

---

### Task 8: Main toolbar: order, dropdowns, cube icon, lasso hover

**Files:**
- Create: `frontend/src/widgets/landmarks/chrome/mode-dropdown.tsx`
- Modify: `chrome/topbar.tsx`, `chrome/primitives.tsx`, `helpers.ts`
- Test: `frontend/e2e/landmarks/landmarks.spec.ts`

**Interfaces:**
- Produces: `ModeDropdown({ modes, mode, onMode, fallbackLabel }: { modes: string[]; mode: string; onMode(m: string): void; fallbackLabel: string })`: left click arms the last-used mode in `modes` (module-level `Map` keyed by `modes.join()`; default `modes[0]`), right click or the chevron opens the menu.

- [ ] **Step 1: Write the failing e2e**

Append to `landmarks.spec.ts`:

```ts
test("toolbar: interaction order, lasso and landmark dropdowns, cube icon", async ({ page }) => {
  const bar = page.getByRole("toolbar", { name: "Drawing tools" });
  const radios = bar.getByRole("radio");
  const names = await radios.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(names).toEqual(["Select", "Move", "Inspect", "Probe", "Node"]);
  await expect(bar.locator('[aria-label="Inspect"] svg.lucide-box')).toHaveCount(1);
  const landmark = bar.getByRole("button", { name: /Point\. Right-click for landmark menu/ });
  await landmark.click();
  await expect.poll(() => getModel(page, "mode")).toBe("point");
  await landmark.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Spline/ }).click();
  await expect.poll(() => getModel(page, "mode")).toBe("spline");
  await bar.getByRole("radio", { name: "Select" }).click();
  await bar.getByRole("button", { name: /Spline\. Right-click for landmark menu/ }).click(); // remembers last used
  await expect.poll(() => getModel(page, "mode")).toBe("spline");
});

test("active lasso keeps its colours on hover in dark mode", async ({ page }) => {
  const lasso = page.getByRole("button", { name: /Lasso\. Right-click for shape menu/ });
  await lasso.click();
  await lasso.hover();
  const [bg, fg] = await lasso.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  expect(bg).not.toBe(fg);
  const select = page.getByRole("radio", { name: "Select" });
  await select.click(); await select.hover();
  const onBg = await select.evaluate((el) => getComputedStyle(el).backgroundColor);
  await lasso.click(); await lasso.hover();
  expect(await lasso.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(onBg);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx playwright test e2e/landmarks/landmarks.spec.ts -g "toolbar|lasso keeps"`
Expected: FAIL (order and landmark dropdown).

- [ ] **Step 3: Implement**

- `helpers.ts`: `INTERACTION_MODE_IDS = ["select", "move", "inspect", "probe", "node"]` and `MODE_LABELS.move = "Move"` if not already.
- `primitives.tsx`: `inspect: BoxIcon` (import `BoxIcon` from lucide-react, drop `ScanIcon` if unused); `chromeHitOnClass = "bg-foreground text-background hover:bg-foreground hover:text-background dark:hover:bg-foreground dark:hover:text-background"`.
- `mode-dropdown.tsx`: move `SelectionShapeMenu`'s body here, generalised: `aria-label={`${label}. Right-click for ${menuNoun} menu.`}` where `menuNoun` is a prop ("shape" for lasso, "landmark" for landmarks), current icon follows the armed mode.
- `topbar.tsx`: `ModeToggle(interactionModes)` | `ModeDropdown(geometry, "shape")` · `ModeDropdown(landmarks, "landmark")` | + − reset | full screen; remove the landmark `ModeToggle`.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm run test:e2e:landmarks && npm run test:e2e:core`
Expected: all pass. Fix older specs that click landmark radios by name (`getByRole("radio", { name: "Point" })`) to use the dropdown (`clickLandmarkTool(page, "Point")` helper in `e2e/helpers.ts`).

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(landmarks): regroup the main toolbar with lasso and landmark dropdowns"
```

---

### Task 9: Collapsible side panels with peek tabs

**Files:**
- Create: `frontend/src/widgets/landmarks/chrome/panel-peek.tsx`
- Modify: `LandmarksView.tsx`, `landmarks.css`
- Test: `frontend/e2e/landmarks/landmarks.spec.ts`

**Interfaces:**
- Produces: `PanelCollapseButton({ side, onCollapse }: { side: "left" | "right"; onCollapse(): void })` (`aria-label="Collapse left panel"` / `"Collapse right panel"`, lucide `PanelLeftCloseIcon` / `PanelRightCloseIcon`), `PanelPeekTab({ side, onExpand })` (`aria-label="Show left panel"` / `"Show right panel"`, `PanelLeftOpenIcon` / `PanelRightOpenIcon`).

- [ ] **Step 1: Write the failing e2e**

```ts
test("side panels collapse to a peek tab and come back", async ({ page }) => {
  const left = page.locator(".landmarks__chrome-dock--left");
  await page.getByRole("button", { name: "Collapse left panel" }).click();
  await expect(left).toHaveAttribute("data-collapsed", "true");
  await page.getByRole("button", { name: "Show left panel" }).click();
  await expect(left).toHaveAttribute("data-collapsed", "false");
  const box = await canvasBox(page);
  await page.mouse.click(box.x + 5, box.y + box.height - 5); // focus the widget
  await page.keyboard.press("]");
  await expect(page.locator(".landmarks__chrome-dock--right")).toHaveAttribute("data-collapsed", "true");
  await page.keyboard.press("]");
  await expect(page.locator(".landmarks__chrome-dock--right")).toHaveAttribute("data-collapsed", "false");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx playwright test e2e/landmarks/landmarks.spec.ts -g "side panels"`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `LandmarksView`: `const [collapsed, setCollapsed] = useState({ left: false, right: false })`; each dock gets `data-collapsed`, the class `landmarks__chrome-dock--collapsed` when collapsed, a `PanelCollapseButton` absolutely positioned at the dock's outer top corner, and a sibling `PanelPeekTab` rendered when collapsed. The narrow layout toggles `left` for its single stacked dock.
- Keys: `useEffect` adding a `keydown` listener on `rootRef.current` (the engine's canvas has focus inside the root) that ignores events from `input`, `textarea` and `[contenteditable]`, and maps `[` → left, `]` → right with `preventDefault()`.
- CSS:

```css
.landmarks__chrome-dock { transition: transform 180ms ease, opacity 180ms ease; }
.landmarks__chrome-dock--left.landmarks__chrome-dock--collapsed { transform: translateX(calc(-100% - var(--lm-chrome-inset))); opacity: 0; pointer-events: none; }
.landmarks__chrome-dock--right.landmarks__chrome-dock--collapsed { transform: translateX(calc(100% + var(--lm-chrome-inset))); opacity: 0; pointer-events: none; }
.landmarks__peek-tab { position: absolute; top: calc(var(--lm-chrome-band) + var(--lm-chrome-gap)); z-index: 17; }
.landmarks__peek-tab--left { left: 0; border-radius: 0 9999px 9999px 0; }
.landmarks__peek-tab--right { right: 0; border-radius: 9999px 0 0 9999px; }
@media (prefers-reduced-motion: reduce) { .landmarks__chrome-dock { transition: none; } }
```

Use `Button variant="ghost" size="icon-sm"` with the Soft Float surface class for the tab (`landmarks-float`).

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm run test:e2e:landmarks`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(landmarks): collapse side panels to peek tabs ([ and ])"
```

---

### Task 10: Docs, feature maps, full gate

**Files:**
- Create: `docs/adr/0006-landmarks-hosts-volume-cube.md`; `.agents/skills/verify-landmarks/features/inspect-cube.md`, `toolbar-layout.md`, `panel-peek.md`
- Modify: `AGENTS.md` (ADR table row), `.agents/skills/verify-landmarks/features/README.md`, `.agents/skills/verify-volume-cube/features/README.md` (notebook-link row removed; note `VolumeCube` is shared), `.agents/skills/verify-volume-cube/features/landmarks-inspect-drives-cube.md` (point at the new spec or delete), `frontend/e2e/README.md` (tiers and harness list), `CONTEXT.md` if it names the notebook-link harness

- [ ] **Step 1: ADR 0006**

Short ADR in the style of 0005: decision (Landmarks renders the cube in its own chrome; `LandmarksWidget(sdata)` infers it; three traits), why (one gesture, no notebook glue, highlight from panel state without a Python round trip), consequences (Viv in the Landmarks bundle, lazy in dev; standalone `VolumeCubeWidget` remains for rendering work; traits budget).

- [ ] **Step 2: Feature-map files**

Each with the four H2 sections used by the existing files (Sub-features, How to get to it, Driving it with Playwright, Proof), citing the spec titles from Tasks 7–9 and the `data-*` attributes.

- [ ] **Step 3: Full gate**

Run:

```bash
uv run pytest -q
cd frontend && npx tsc --noEmit -p . && npm run test:e2e:core && npm run test:e2e:landmarks && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts && npm run test:e2e:volume-cube
```

Expected: everything passes; list the counts in the commit message.

- [ ] **Step 4: Commit**

```bash
git add docs AGENTS.md .agents frontend/e2e/README.md CONTEXT.md
git commit -m "docs: ADR 0006 and feature maps for the Landmarks cube, toolbar and panels"
```

---

### Task 11: Colon A2 demo on `LandmarksWidget(sdata)` (repo `D:\clarence\pyxa_scverse_demo`, branch `colon-a2-demo`)

**Files:**
- Modify: `build_colon_a2.py`, `colon_a2.py`, `README.md`

**Interfaces:**
- Consumes: `LandmarksWidget(sdata)` (Task 2).

- [ ] **Step 1: Write the mosaic into the SpatialData**

Add `mosaic_element(source: Path) -> DataTree` to `build_colon_a2.py`:
- Open each `scaleN/image` of `Region/mosaic/mosaic_3d.ome.zarr` with `dask.array.from_zarr` (zarr v3), drop the `t` axis (`[0]`), keep `c, z, y, x`.
- Build the multiscale from those levels without recomputing: `Image3DModel.parse(levels[0], dims=("c","z","y","x"), scale_factors=None, chunks=(1, 32, 256, 256), transformations={"global": Sequence([Scale(level0_scale, ("z","y","x")), Translation(level0_translation, ("z","y","x"))])})` for level 0, then assemble the other levels into the `DataTree` as `scale1…scale5` with their own Scale transforms (mirror how `labels_element` builds the labels pyramid in the same file, and match the level-0 transform exactly so `resolve_volume` finds image and labels on one grid).
- Write it with `sdata.write_element("mosaic")` after the labels. If the installed spatialdata / ome-zarr writer accepts shard settings for zarr v3, pass shards of `(1, 32, 1024, 1024)`; otherwise plain `(1, 32, 256, 256)` chunks. Record which one was used in the script's docstring.
- Drop `uns["pyxa"]["mosaic_3d"]`.
- Add `--no-mosaic` to skip it (fast rebuilds of the table and labels).

- [ ] **Step 2: Rebuild and check**

Run: `uv run python build_colon_a2.py --overwrite` (time it), then:

```bash
uv run python -c "import spatialdata as sd; s = sd.read_zarr('data/colon_a2.sdata.zarr'); print(s); from spatial_rx.volume_source import resolve_volume; a, v = resolve_volume(s); print(v.image, v.labels, v.voxel_size_um, v.origin_um, v.shape_zyx)"
```

Expected: `mosaic cell_labels (0.5, 0.4506..., 0.4506...) (-6.08..., -1114.26..., -2686.36...) (284, 9786, 11889)`.

- [ ] **Step 3: One-cell notebook**

`colon_a2.py` becomes: imports; the build check (`mo.stop` if missing); `landmarks = mo.ui.anywidget(LandmarksWidget(sd.read_zarr(SDATA_PATH), color="Cluster", contrast_limits=(40, 255)))` with `inspect_size_um = 500`; display. Remove the FloatingPanel, cube and sync cells, and the `wigglystuff` import. Keep an optional cut-box table cell reading `landmarks.volume_cut`. Run `uvx marimo check colon_a2.py` and `uv run python colon_a2.py`.

- [ ] **Step 4: README**

Describe: build writes `tables/rna`, `labels/cell_labels`, `images/mosaic`; the notebook is `LandmarksWidget(sdata)`; Inspect (`I`) opens the cube.

- [ ] **Step 5: Commit**

```bash
git add build_colon_a2.py colon_a2.py README.md
git commit -m "Colon A2: mosaic in the SpatialData; LandmarksWidget(sdata) with the inspect cube"
```

---

## Self-review

- **Spec coverage:** inference and overrides (Task 1–2), mosaic element (11), three traits and budget test (2), shared component (4), shader palette / alpha / gamma (3), engine hover / place / drag / Esc (5), highlight rules (6), cube window, Inspect toolbar L1/L2 (7), toolbar order, dropdown, icon, lasso hover (8), panel peek and shortcuts (9), error states (Task 7 Step 7 pill; Task 1 warnings; `VolumeCube` status line kept in Task 4), ADR and feature maps (10).
- **Known checks during execution:** spatialdata's on-disk metadata version for the toy (`zarr.json` vs `.zattrs`, Task 2 Step 1); selection polygon key (Task 6 Step 1); expected highlight counts against the toy window (Task 7 Step 2); spatialdata shard support (Task 11 Step 1).
