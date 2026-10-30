# Load AnnData / SpatialData

Open milume on AnnData or SpatialData you already have in the notebook.

## Goal

Show spatial cells (and, for SpatialData, the Inspect cube when a 3D image is available) with `milume.peek`.

## AnnData

1. Load AnnData with coordinates in `obsm["spatial"]` (for example the ileum demo slice):

```python
import milume
import milume.datasets as mds

adata = mds.ileum_merfish_xu2026()
w = milume.peek(adata, color="cell_type")
w
```

2. If your matrix uses another `obsm` key, pass `spatial_key=` when you call `peek`.

**Result:** The Landmarks map opens on the ileum section, colored by `cell_type`.

Constructor options (`color`, `genes`, `spatial_key`, …) are in the [LandmarksWidget API](../reference/api/landmarks.md#constructor-parameters).

## SpatialData

Install the platform reader once:

```bash
pip install spatialdata-io
```

Then read with the loader for your platform and pass the object to `peek`. milume infers the table, cell polygons, and 3D image when they are present. Override with `table=`, `image=`, `labels=`, or `shapes=` when needed ([constructor parameters](../reference/api/landmarks.md#constructor-parameters)).

### Pyxa

1. Install a `spatialdata-io` build that includes the Pyxa reader (see the [Landmarks molab demo](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/landmarks.py) pin if the release you use does not yet ship `pyxa`).

2. Read Stellaromics Pyxa output into SpatialData:

```python
from pathlib import Path

import spatialdata as sd
from spatialdata_io.experimental import pyxa

data_dir = Path("/path/to/pyxa/small")  # counts, metadata, DAPI mosaic
sdata = pyxa(data_dir, cell_assigned_gene=False)
```

3. To use **Inspect** on the DAPI mosaic, write the store to disk and reopen it (the cube reads the image from Zarr):

```python
store = Path("/tmp/pyxa.sdata.zarr")
sdata.write(store, overwrite=True)
sdata = sd.read_zarr(store)
```

4. Open milume on the table you want to color (for example `rna` after you add a cluster column):

```python
w = milume.peek(sdata, color="cluster")
w
```

**Result:** Pyxa cells and mosaic load; Inspect is available after the Zarr round-trip.

### Xenium

1. Point `spatialdata_io.xenium` at the Xenium `*_outs` folder (or a subset of its files):

```python
import spatialdata_io as sio
import milume

sdata = sio.xenium("/path/to/xenium_outs", transcripts=False)
w = milume.peek(sdata)
w
```

2. Set `w.color` to any categorical column on the table, or pass `color=` to `peek` when you open it.

**Result:** Xenium cells render in global coordinates from `obsm["spatial"]` (default `spatial_key`).

Platform-specific reader flags stay in the [spatialdata-io](https://github.com/scverse/spatialdata-io) docs.

### CosMx

1. Read CosMx flat files with `spatialdata_io.cosmx`:

```python
import spatialdata_io as sio
import milume

sdata = sio.cosmx("/path/to/cosmx_flat_files", dataset_id="my_run", transcripts=False)
```

2. Pass `spatial_key="global"`. CosMx FOV-local pixels live in `obsm["spatial"]`; milume needs global coordinates:

```python
w = milume.peek(sdata, spatial_key="global")
w
```

**Result:** CosMx cells from every FOV share one map in global pixel space.

For Inspect behavior on platforms without per-slice cell meshes, see [Inspect in 3D](../reference/ui/inspect-3d.md).
