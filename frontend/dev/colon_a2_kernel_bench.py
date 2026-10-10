"""Minimal marimo app: LandmarksWidget on colon A2 for real-kernel Playwright benches."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="full")


@app.cell
def _():
    import os
    from pathlib import Path

    import marimo as mo
    import spatialdata as sd
    from milume import LandmarksWidget

    return LandmarksWidget, Path, mo, os, sd


@app.cell
def _(LandmarksWidget, Path, mo, os, sd):
    store = Path(os.environ.get("COLON_A2_STORE", "frontend/dev/data/colon_a2.sdata.zarr"))
    sdata = sd.read_zarr(store)
    obs = sdata.tables["rna"].obs
    color = "Cluster" if "Cluster" in obs.columns else obs.columns[0]
    mo.ui.anywidget(LandmarksWidget(sdata, color=color))
    return
