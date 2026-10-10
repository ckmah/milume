# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "huggingface-hub>=0.30",
#     "igraph>=0.11",
#     "leidenalg>=0.10",
#     "marimo>=0.25.1",
#     "marimo-lens",
#     "milume>=1.2.0",
#     "scanpy>=1.10",
#     "spatialdata>=0.2",
#     "spatialdata-io @ git+https://github.com/ckmah/spatialdata-io@pyxa-reader",
# ]
# ///

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell
def _():
    import tempfile
    from pathlib import Path

    import marimo as mo
    import scanpy as sc
    import spatialdata as sd
    from huggingface_hub import snapshot_download
    from spatialdata_io.experimental import pyxa

    from milume import landmarks_to_geodataframe, peek

    return (
        Path,
        landmarks_to_geodataframe,
        mo,
        peek,
        pyxa,
        sc,
        sd,
        snapshot_download,
        tempfile,
    )


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Landmarks

    A 100 µm cube of Stellaromics Pyxa output: `small/` of the
    [Stellaromics/demo](https://huggingface.co/datasets/Stellaromics/demo)
    dataset (4,372 cells, 3D DAPI mosaic, ~215 MB download).

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
def _(Path, pyxa, snapshot_download):
    # Pyxa output: counts, cell metadata (µm) and the zipped OME-Zarr DAPI mosaic.
    data_dir = (
        Path(
            snapshot_download(
                "Stellaromics/demo",
                repo_type="dataset",
                allow_patterns="small/*",
                ignore_patterns="*cell_assigned_gene*",  # transcripts: not needed here
            )
        )
        / "small"
    )
    pyxa_sdata = pyxa(data_dir, cell_assigned_gene=False, labels=True)
    return (pyxa_sdata,)


@app.cell
def _(pyxa_sdata, sc):
    # Exploratory clusters to color by
    adata = pyxa_sdata.tables["rna"]
    sc.pp.normalize_total(adata)
    sc.pp.log1p(adata)
    sc.pp.pca(adata)
    sc.pp.neighbors(adata)
    sc.tl.leiden(adata, key_added="cluster", flavor="leidenalg", n_iterations=2)
    pyxa_sdata.tables["rna"] = adata
    return


@app.cell
def _(Path, pyxa_sdata, sd, tempfile):
    # The inspect cube reads the image from a SpatialData Zarr store on disk.
    store = Path(tempfile.gettempdir()) / "milume-small.sdata.zarr"
    pyxa_sdata.write(store, overwrite=True)
    sdata = sd.read_zarr(store)
    sdata
    return (sdata,)


@app.cell
def _(mo, peek, sdata):
    widget = mo.ui.anywidget(peek(sdata, color="cluster"))
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
