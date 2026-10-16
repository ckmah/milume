"""Load HF Stellaromics/demo small polygons in µm with label ids (pyxa reader's own conversion)."""
from pathlib import Path
import numpy as np, pandas as pd
from spatialdata_io.readers.pyxa import _get_voxel_size, _get_shapes

STORE = "/workspace/milume-sweep-main/frontend/dev/landmarks-volume/public/small.sdata.zarr"
D = Path("/workspace/hf_demo/small")

def load():
    xy, z = _get_voxel_size(D / "cell_metadata_v1.csv")
    gdf = _get_shapes(D / "segmentation_geometries_v1.parquet", xy, z)
    import anndata as ad
    a = ad.read_zarr(STORE + "/tables/rna")
    labels = dict(zip(a.obs.cell_id.astype(str), a.obs.label_id.astype(int)))
    return gdf, labels, xy, z
