# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo>=0.25.1",
#     "milume @ file:///workspace",
#     "spatialdata>=0.2",
# ]
# ///

"""Marimo e2e: deprecated ``active_genes`` assignment warns in the kernel."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="full")


@app.cell
def _():
    import tempfile
    import warnings
    from pathlib import Path

    import marimo as mo
    import spatialdata as sd

    from milume import peek

    toy = Path(__file__).resolve().parents[3] / "dev/landmarks-volume/public/toy.sdata.zarr"
    store = Path(tempfile.gettempdir()) / "milume-marimo-e2e-toy-color-dep.sdata.zarr"
    if not store.exists():
        sd.read_zarr(toy).write(store)
    sdata = sd.read_zarr(store)
    return mo, peek, sdata, warnings


@app.cell
def _(mo, peek, sdata):
    w = peek(sdata, color="cell_type")
    widget = mo.ui.anywidget(w)
    return mo, w, widget


@app.cell
def _(widget):
    widget
    return


@app.cell
def _(mo, w, warnings):
    with warnings.catch_warnings(record=True) as log:
        warnings.simplefilter("always")
        w.active_genes = ["0"]
    dep = [x for x in log if issubclass(x.category, DeprecationWarning)]
    mo.md(f"color-deprecation-probe color={w.color!r} deprecation_n={len(dep)}")
    return


if __name__ == "__main__":
    app.run()
