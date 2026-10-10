# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo>=0.24.0",
#     "milume",
# ]
# ///

"""Minimal marimo app: LandmarksWidget on colon A2 for real-kernel Playwright benches."""

import os
from pathlib import Path

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="full")


@app.cell
def _():
    from milume import LandmarksWidget

    return (LandmarksWidget,)


@app.cell
def _():
    import marimo as mo

    return (mo,)


@app.cell
def _(LandmarksWidget, mo):
    store = Path(os.environ.get("COLON_A2_STORE", "frontend/dev/data/colon_a2.sdata.zarr"))
    import spatialdata as sd

    sdata = sd.read_zarr(store)
    color = "Cluster" if "Cluster" in sdata.tables["rna"].obs else sdata.tables["rna"].obs.columns[0]
    widget = mo.ui.anywidget(LandmarksWidget(sdata, color=color))
    widget
    return (widget,)


if __name__ == "__main__":
    app.run()
