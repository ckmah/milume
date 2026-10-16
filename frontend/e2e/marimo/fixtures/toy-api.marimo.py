# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo>=0.25.1",
#     "milume @ file:///workspace",
#     "spatialdata>=0.2",
# ]
# ///

"""Python API e2e target: color and selections set from Python, get_obs_names read in a reactive cell."""

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
    return mo, peek, sdata


@app.cell
def _(mo, peek, sdata):
    w = peek(sdata, color="cell_type")
    # Set from Python before display: must reach the browser model.
    w.color = "cell_id"
    w.selections = [{"id": "api-sel", "point_indices": [0]}]
    widget = mo.ui.anywidget(w)
    return w, widget


@app.cell
def _(widget):
    widget
    return


@app.cell
def _(mo, w, widget):
    # Reading widget.value makes this cell re-run when the browser changes a trait.
    _ = widget.value
    _n = len(w.get_obs_names("api-sel"))
    mo.md(f"api-probe n={_n} color={w.color}")
    return


if __name__ == "__main__":
    app.run()
