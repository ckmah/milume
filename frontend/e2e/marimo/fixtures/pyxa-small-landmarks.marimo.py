# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "huggingface-hub>=0.30",
#     "marimo>=0.25.1",
#     "milume @ file:///workspace",
#     "scanpy>=1.10",
#     "spatialdata>=0.2",
#     "spatialdata-io @ git+https://github.com/ckmah/spatialdata-io@pyxa-reader",
# ]
# ///

"""Marimo e2e: Stellaromics Pyxa `small/` (~4.3k cells), molab-scale selection."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="full")


@app.cell
def _():
    import tempfile
    from pathlib import Path

    import marimo as mo
    import scanpy as sc
    import spatialdata as sd
    from huggingface_hub import snapshot_download
    from spatialdata_io.experimental import pyxa

    from milume import peek

    return Path, mo, peek, pyxa, sc, sd, snapshot_download, tempfile


@app.cell
def _(Path, pyxa, sc, sd, snapshot_download, tempfile):
    data_dir = (
        Path(
            snapshot_download(
                "Stellaromics/demo",
                repo_type="dataset",
                allow_patterns="small/*",
                ignore_patterns="*cell_assigned_gene*",
            )
        )
        / "small"
    )
    pyxa_sdata = pyxa(data_dir, cell_assigned_gene=False, labels=True)
    adata = pyxa_sdata.tables["rna"]
    if "cluster" not in adata.obs:
        sc.pp.neighbors(adata, n_neighbors=10, n_pcs=min(30, adata.n_vars - 1))
        sc.tl.leiden(adata, key_added="cluster", flavor="leidenalg", n_iterations=2)
        pyxa_sdata.tables["rna"] = adata
    store = Path(tempfile.gettempdir()) / "milume-marimo-e2e-pyxa.sdata.zarr"
    if not store.exists():
        pyxa_sdata.write(store, overwrite=True)
    sdata = sd.read_zarr(store)
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
def _(mo, sdata, widget):
    len(widget.selections)
    focus_n = len(list(widget.get_focus_obs_names(sdata.tables["rna"])))
    return mo.Html(f'<span data-testid="marimo-focus-count">{focus_n}</span>')


if __name__ == "__main__":
    app.run()
