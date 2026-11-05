# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo>=0.25.1",
#     "milume @ file:///workspace",
#     "spatialdata>=0.2",
# ]
# ///

"""Marimo e2e: gzip eager gene CSC traits synced from Python ``peek(..., genes=...)``."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="full")


@app.cell
def _():
    import tempfile
    from pathlib import Path

    import marimo as mo
    import spatialdata as sd

    from milume import peek

    toy = Path(__file__).resolve().parents[3] / "dev/landmarks-volume/public/toy.sdata.zarr"
    store = Path(tempfile.gettempdir()) / "milume-marimo-e2e-toy.sdata.zarr"
    if not store.exists():
        sd.read_zarr(toy).write(store)
    sdata = sd.read_zarr(store)
    table = sdata.tables["table"]
    return mo, peek, sdata, table


@app.cell
def _(mo, peek, sdata, table):
    w = peek(sdata, color="cell_type", genes=list(table.var_names))
    widget = mo.ui.anywidget(w)
    return w, widget


@app.cell
def _(widget):
    widget
    return


@app.cell
def _(mo, w, widget):
    _ = widget.value
    mo.md(f"gzip-probe codec={w.gene_csc_codec} n_genes={len(w.gene_names)}")
    return


if __name__ == "__main__":
    app.run()
