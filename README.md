# spatial-rx

Tools for exploring spatial omics data in notebooks — reactive widgets that stay
in sync with your Python analysis.


| Tool | Role | Demo |
| ---- | ---- | ---- |
| **LandmarksWidget** | Draw selections and landmarks on tissue coordinates; measure from the notebook | [![Open in molab](https://marimo.io/molab-shield.svg)](https://molab.marimo.io/github/ckmah/spatial-rx/blob/main/demos/landmarks.py) |
| **VolumeCubeWidget** | Isometric 3D cube of an OME-Zarr image and its cell labels | [`demos/volume-cube.py`](demos/volume-cube.py) |


More widgets and helpers may land here over time.

## Install

```bash
pip install spatial-rx
```

From source:

```bash
uv sync --extra demo --group dev
```

## LandmarksWidget

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/landmarks_widget_dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="assets/landmarks_widget_light.png" />
  <img alt="Landmarks widget" src="assets/landmarks_widget_light.png" />
</picture>

Draw selections and landmarks on tissue coordinates, color by category or gene,
expand neighborhoods, and inspect the 3D tissue under a window.

```python
from spatial_rx import LandmarksWidget

w = LandmarksWidget(adata, color="cell_type")   # AnnData with obsm["spatial"]
w = LandmarksWidget(sdata, color="cell_type")   # SpatialData on disk: adds the 3D cube
```

From a SpatialData, the widget finds the table, the labels element it
annotates, a 3D image on the same grid, and their µm frame (override with
`table=`, `image=`, `labels=`; `contrast_limits=` for the image). Press **I**
(Inspect): hovering shows a live coarse preview of the tissue under the
cursor, and a click places a 300 µm window and docks a floating
full-resolution cube of it, colored like the map, with your landmarks drawn on
top. **Save** in the dock's title bar adds the window as an **inspect
selection** to its history strip. Read the inspected cells back with
`w.get_obs_names(adata, "<inspect id>")` or `w.selections`. Hold
**Space** to pan in any tool.

Read results back in Python:

| Need | Call |
| --- | --- |
| Cells in a selection | `w.get_obs_names(adata, selection_id)`, `w.assign_obs_mask(adata, key, selection_id)` |
| Landmarks as geometry | `landmarks_to_geodataframe(w.landmarks)` |
| Measure against landmarks | `distances`, `composition`, `along_positions` (+ `write_obs`) |
| Compare a subset with the tissue | `enrichment(adata, obs_names, obs_key=...)` |
| XY vs 3D neighbors | `nearest_distances(adata, seeds, obs_key=...)` (needs `obsm["spatial"]` x, y, z) |
| Map colors for other plots | `w.category_colors("cell_type")` |
| Inspect window and cube cut | `w.inspect_cx`, `w.inspect_cy`, `w.inspect_size_um`; `w.volume_cut` = x0, x1, y0, y1, z0, z1 µm (intersect X/Y with the window for the shown box) |

Large expression matrices are sent sparse; pass `genes=` to limit the gene
catalog. `VolumeCubeWidget` is the same cube as a standalone widget for an
OME-Zarr image.
