import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import tempfile
    import zipfile
    from pathlib import Path

    import anndata as ad
    import dask.array as da
    import marimo as mo
    import numpy as np
    import pandas as pd
    import scanpy as sc
    import spatialdata as sd
    import zarr
    from huggingface_hub import snapshot_download
    from spatialdata.models import Image3DModel, TableModel
    from spatialdata.transformations import Scale, Sequence, Translation

    from spatial_rx import (
        LandmarksWidget,
        landmarks_to_geodataframe,
    )

    return (
        Image3DModel,
        LandmarksWidget,
        Path,
        Scale,
        Sequence,
        TableModel,
        Translation,
        ad,
        da,
        landmarks_to_geodataframe,
        mo,
        np,
        pd,
        sc,
        sd,
        snapshot_download,
        tempfile,
        zarr,
        zipfile,
    )


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Landmarks

    A 100 µm cube of Stellaromics Pyxa output: `xsmall/` of the
    [Stellaromics/demo](https://huggingface.co/datasets/Stellaromics/demo)
    dataset (187 cells, 3D DAPI mosaic, ~8 MB).

    1. Draw/edit landmarks on the canvas; use the contextual toolbar for buffer /
       style and neighborhood controls (neighborhoods expand client-side).
    2. Wrap the widget in `mo.ui.anywidget` so landmark edits re-run downstream
       cells; build a GeoDataFrame from `widget.landmarks`.
    3. Enable Radius/k-NN on a type or selection → **Make selection** on the
       contextual bar to promote the neighborhood (frozen `point_indices`).
    4. **Inspect** (`I`, then click the tissue) opens the DAPI mosaic under the
       window in a 3D cube.
    """)
    return


@app.cell
def _(Path, snapshot_download, zipfile):
    # Pyxa output: counts, cell metadata (µm) and the zipped OME-Zarr DAPI mosaic.
    data_dir = (
        Path(snapshot_download("Stellaromics/demo", repo_type="dataset", allow_patterns="xsmall/*"))
        / "xsmall"
    )
    mosaic_path = data_dir / "mosaic_3d.ome.zarr"
    if not mosaic_path.exists():
        zipfile.ZipFile(data_dir / "mosaic_3d.ome.zarr.zip").extractall(data_dir)
    return data_dir, mosaic_path


@app.cell
def _(ad, data_dir, np, pd, sc):
    counts = pd.read_csv(data_dir / "cell_by_gene_v1.csv", index_col="cell_id")
    cells = pd.read_csv(data_dir / "cell_metadata_v1.csv", index_col="cell_id").loc[counts.index]
    adata = ad.AnnData(
        counts.to_numpy(dtype=np.float32),
        obs=cells[["Volume_um3"]],
        var=pd.DataFrame(index=counts.columns),
    )
    adata.obsm["spatial"] = cells[["X_um", "Y_um", "Z_um"]].to_numpy()

    # Exploratory clusters to color by
    sc.pp.normalize_total(adata)
    sc.pp.log1p(adata)
    sc.pp.pca(adata)
    sc.pp.neighbors(adata)
    sc.tl.leiden(adata, key_added="cluster", flavor="igraph", n_iterations=2)
    return (adata,)


@app.cell
def _(Image3DModel, Scale, Sequence, Translation, da, mosaic_path, zarr):
    # The mosaic's level 0 (t dropped) with its OME-NGFF scale and translation, in µm.
    group = zarr.open_group(str(mosaic_path), mode="r")
    multiscale = group.attrs["ome"]["multiscales"][0]
    axes = [a["name"] for a in multiscale["axes"]]
    zyx = [axes.index(a) for a in ("z", "y", "x")]
    level0 = multiscale["datasets"][0]
    ngff = {t["type"]: t for t in level0["coordinateTransformations"]}
    transform = Sequence(
        [
            Scale([ngff["scale"]["scale"][i] for i in zyx], axes=("z", "y", "x")),
            Translation([ngff["translation"]["translation"][i] for i in zyx], axes=("z", "y", "x")),
        ]
    )
    mosaic = Image3DModel.parse(
        da.from_zarr(group[level0["path"]])[0],
        dims=("c", "z", "y", "x"),
        transformations={"global": transform},
    )
    return (mosaic,)


@app.cell
def _(Path, TableModel, adata, mosaic, sd, tempfile):
    # The inspect cube reads the image from a SpatialData Zarr store on disk.
    store = Path(tempfile.gettempdir()) / "spatial-rx-xsmall.sdata.zarr"
    sd.SpatialData(images={"mosaic": mosaic}, tables={"table": TableModel.parse(adata)}).write(
        store, overwrite=True
    )
    sdata = sd.read_zarr(store)
    sdata
    return (sdata,)


@app.cell
def _(LandmarksWidget, mo, sdata):
    widget = mo.ui.anywidget(LandmarksWidget(sdata, color="cluster"))
    return (widget,)


@app.cell
def _(widget):
    widget
    return


@app.cell
def _(landmarks_to_geodataframe, widget):
    landmarks_gdf = landmarks_to_geodataframe(widget.landmarks)
    landmarks_gdf
    return


if __name__ == "__main__":
    app.run()
