"""Shared loaders for the GPU-mesh exploration (branch proto-cell-mesh-gpu).

Data: HF Stellaromics/demo small (4,372 cells). Polygons in µm via the pyxa reader;
label volume = small.sdata.zarr cell_labels (s0 is 263 x 976 x 2867, uint32).
"""
from __future__ import annotations
import sys, types, os
from pathlib import Path
import numpy as np

REPO = Path(__file__).resolve().parents[2]
if "milume" not in sys.modules:  # import milume.cell_mesh without the package's heavy __init__
    m = types.ModuleType("milume"); m.__path__ = [str(REPO / "milume")]; sys.modules["milume"] = m

STORE = os.environ.get("SMALL_SDATA", "/workspace/milume-sweep-main/frontend/dev/landmarks-volume/public/small.sdata.zarr")
HF = Path(os.environ.get("HF_SMALL", "/workspace/hf_demo/small"))
CENTRE = (1443.0, -5190.0)  # same window centre as bench_mesh.py


def load_polygons():
    from spatialdata_io.readers.pyxa import _get_voxel_size, _get_shapes
    import anndata as ad
    xy, z = _get_voxel_size(HF / "cell_metadata_v1.csv")
    gdf = _get_shapes(HF / "segmentation_geometries_v1.parquet", xy, z)
    a = ad.read_zarr(STORE + "/tables/rna")
    labels = dict(zip(a.obs.cell_id.astype(str), a.obs.label_id.astype(int)))
    return gdf, labels, xy, z


def window_box(win_um: float):
    cx, cy = CENTRE
    return (cx - win_um / 2, cy - win_um / 2, cx + win_um / 2, cy + win_um / 2)


def label_array(level: str = "s0"):
    import zarr
    return zarr.open_group(STORE + "/labels/cell_labels", mode="r")[level]
