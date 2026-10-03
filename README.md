<p align="center">
  <img src="https://raw.githubusercontent.com/ckmah/milume/main/assets/logo/milume-mark.svg" width="128" alt="Milume logo" />
</p>

# milume

**milume: a thinking surface for spatial omics.**

You have a spatial dataset and a hunch. milume turns a notebook cell into a tactile,
reactive surface where you can look at your tissue, select what catches your eye, and
carry that selection straight into code. Cells, landmarks and measurements stay in
plain `AnnData` / `obs_names` / geometry, so what you see on the surface is what you
analyze next.

One call opens it:

```python
import milume

w = milume.peek(adata, color="cell_type")
```

Draw selections and landmarks, color by category or gene, expand neighborhoods, and
read everything back in Python. The name comes from *mille* (thousand, as in
mille-feuille, layers) + *lume* (light).

[![Open in molab](https://marimo.io/molab-shield.svg)](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/landmarks.py)

## Install

```bash
pip install milume
```

### Migrate from spatial-rx

Note: Milume was formerly `spatial-rx`. The API is unchanged; only the names moved:

```bash
pip uninstall spatial-rx
pip install milume
```

```python
import milume   # was: import spatial_rx
```

## Alongside other viewers

Milume complements other viewers. Use `milume` to form intuition: layer images, cells,
and transcripts in a notebook, select what stands out, and carry the selection straight
into your analysis code. Use heavier viewers when you need to inspect in depth.
Landmarks and selections round-trip as plain geometry and `obs_names`, so you can hand
the same regions to any viewer.

From source:

```bash
uv sync --extra demo --group dev
```

## milume.peek

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/landmarks_widget_dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="assets/landmarks_widget_light.png" />
  <img alt="milume surface" src="assets/landmarks_widget_light.png" />
</picture>

`milume.peek(data, **kwargs)` opens the surface on your data and returns a widget `w`
you read results from.

```python
import milume

w = milume.peek(adata, color="cell_type")   # AnnData with obsm["spatial"]
w = milume.peek(sdata, color="cell_type")   # SpatialData on disk: adds the 3D cube
```

| Argument | Meaning |
| --- | --- |
| `data` | `AnnData` with `obsm["spatial"]`, or a `SpatialData` |
| `color` | `obs` column to color cells by |
| `genes` | gene(s) to expose for coloring; limits the catalog on large matrices |
| `spatial_key` | `obsm` key holding coordinates (default `"spatial"`) |
| `table`, `image`, `labels` | override what is inferred from a `SpatialData` |
| `contrast_limits` | display range for the 3D image |

- From a SpatialData, the widget finds the table, the labels element it annotates, a 3D image on the same grid, and their µm frame (override with `table=`, `image=`, `labels=`; `contrast_limits=` for the image).
- Press **I** (Inspect): hovering shows a live coarse preview of the tissue under the cursor, and a click places a 300 µm window and docks a floating full-resolution cube of it, colored like the map, with your landmarks drawn on top.
- **Save** in the dock's title bar adds the window as an **inspect selection** to its history strip. Read the inspected cells back with `w.get_obs_names(adata, "<inspect id>")` or `w.selections`.
- Hold **Space** to pan in any tool.

Read results back in Python:

| Need | Call |
| --- | --- |
| Cells in a selection | `w.get_obs_names(selection_id=...)`, `w.assign_obs_mask(adata, key, selection_id)` |
| Landmarks as geometry | `landmarks_to_geodataframe(w.landmarks)` |
| Measure against landmarks | `distances`, `composition`, `along_positions` (+ `write_obs`) |
| Compare a subset with the tissue | `enrichment(adata, obs_names, obs_key=...)` |
| XY vs 3D neighbors | `nearest_distances(adata, seeds, obs_key=...)` (needs `obsm["spatial"]` x, y, z) |
| Map colors for other plots | `w.category_colors("cell_type")` |
| Inspect window and cube cut | `w.inspect_cx`, `w.inspect_cy`, `w.inspect_size_um`; `w.volume_cut` = x0, x1, y0, y1, z0, z1 µm (intersect X/Y with the window for the shown box) |

Large expression matrices are sent sparse; pass `genes=` to limit the gene
catalog.

### Platform compatibility

Milume plots the coordinates you point it at: `obsm[spatial_key]` of the table.
It does not guess positions or coordinate systems from SpatialData elements, so
nothing is computed at construction beyond packing what you will color by. What
the `spatialdata-io` readers write for `obsm`, and what to pass:

| Platform | What to pass |
| --- | --- |
| Pyxa, Meteor, Xenium, Visium, seqFISH, Stereo-seq, Curio | nothing: `obsm["spatial"]` is the cell position |
| CosMx | `spatial_key="global"` (`obsm["spatial"]` is local to each FOV) |
| MERSCOPE | nothing: positions are µm, whatever the SpatialData's own pixel coordinate system is |
| Several tables (seqFISH ROIs, Visium HD bin sizes) | `table="..."` |
| One FOV or slide of a table that spans several (MIBI-TOF, Visium) | slice first: `milume.peek(t[t.obs["fov"] == "1"])` |
| No `obsm` (MERFISH, Visium HD segmentations) | add positions first, then peek (below) |

```python
import spatialdata as sd

t = sdata.tables["table"]
cent = sd.get_centroids(sdata["cells"], coordinate_system="global").compute()
t.obsm["spatial"] = cent.loc[t.obs["cell_id"], ["x", "y"]].to_numpy()
w = milume.peek(sdata)
```

The widget does not know which SpatialData coordinate system your coordinates
are in. When you place landmarks into the SpatialData, declare it yourself
([contract](docs/landmarks-spatialdata-contract.md)).

**Tested against** the example datasets on the
[SpatialData datasets page](https://spatialdata.scverse.org/en/stable/tutorials/notebooks/datasets/README.html),
converted in [spatialdata-sandbox](https://github.com/giovp/spatialdata-sandbox):
MERFISH, MIBI-TOF, Molecular Cartography, Visium and Visium HD (cell
segmentations), plus Pyxa. The rows for Xenium, CosMx, MERSCOPE, seqFISH,
Stereo-seq and Curio come from reading what the
[`spatialdata-io`](https://github.com/scverse/spatialdata-io) readers write,
not from real data.

**Formats change.** SpatialData, its readers and the vendors' outputs are still
evolving, so the table above is a snapshot. If a reader moves positions to
another `obsm` key or coordinate system, or a dataset arrives in a layout not
listed, you may need to adjust it yourself: choose `spatial_key`, pick the
`table`, slice the AnnData, or add positions as shown above.
