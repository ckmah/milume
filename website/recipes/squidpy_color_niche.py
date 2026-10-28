# /// script
# requires-python = ">=3.11,<3.15"
# dependencies = [
#     "leidenalg>=0.12",
#     "marimo>=0.25.1",
#     "marimo-studio==0.4.1",
#     "milume @ file:///workspace",
#     "scanpy>=1.10",
#     "squidpy>=1.6"
# ]
# [tool.marimo-studio]
# default = "docs"
# runtimes = ["server", "zero-python"]
#
# [tool.marimo-studio.cells]
# cell-1 = {ref = "cell:v1:a54ce8c5034085f1302e2273aad32173ecfaf9a0aa357236cdb43afd65e3cfbf:ac4532616a5847bc00b3c8dd8d41f2be3550011c462f1d8d3ef621b42d0fd2d7:0"}
# ///
"""Squidpy niche color recipe — marimo-studio spike for issue #242."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        # Squidpy niche labels

        Recolour Landmarks from Squidpy neighborhood niches on the synthetic harness
        geometry used in CI (not colon or Pyxa demo slices).

        **Open in molab:**
        [squidpy_color_niche.py](https://molab.marimo.io/github/ckmah/milume/blob/main/website/recipes/squidpy_color_niche.py)
        """
    )
    return


@app.cell
def _():
    import marimo as mo

    import milume
    import pandas as pd
    import scanpy as sc
    import squidpy as sq

    from tests.squidpy_color_recipes import (
        niche_obs_key,
        run_niche_recipe,
        synthetic_recipe_adata,
    )

    return (
        milume,
        mo,
        niche_obs_key,
        pd,
        run_niche_recipe,
        sc,
        sq,
        synthetic_recipe_adata,
    )


@app.cell
def _(synthetic_recipe_adata):
    adata = synthetic_recipe_adata(n=200, seed=2)
    return (adata,)


@app.cell
def _(adata, milume):
    w = milume.peek(adata, color="cell_type")
    w.selections = [
        {
            "id": "patch",
            "type": "rectangle",
            "cx": 50.0,
            "cy": 50.0,
            "width": 80.0,
            "height": 80.0,
            "angle": 0.0,
        },
    ]
    return (w,)


@app.cell
def _(adata, run_niche_recipe, w):
    niche_col = run_niche_recipe(adata, w, "patch")
    w.color = niche_col
    return (niche_col,)


@app.cell
def _(mo, w):
    widget = mo.ui.anywidget(w)
    return (widget,)


@app.cell
def landmark_map(mo, widget):
    widget
    return (widget,)


@app.cell
def recipe_code(mo, niche_col):
    mo.md(
        f"""
        After `sq.gr.calculate_niche(...)`, assign **`w.color = "{niche_col}"`**
        (column Squidpy writes to `adata.obs`).
        """
    )
    return


if __name__ == "__main__":
    app.run()
