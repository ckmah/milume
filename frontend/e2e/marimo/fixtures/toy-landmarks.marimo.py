# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo>=0.25.1",
#     "milume @ file:///workspace",
#     "spatialdata>=0.2",
# ]
# ///

"""Fast local target for marimo volume e2e (CI uses demos/landmarks.py)."""

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
    widget = mo.ui.anywidget(peek(sdata, color="cell_type"))
    return (widget,)


@app.cell
def _(widget):
    widget
    return


if __name__ == "__main__":
    app.run()
