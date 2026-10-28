# /// script
# requires-python = ">=3.11,<3.15"
# dependencies = [
#     "leidenalg>=0.12",
#     "marimo>=0.25.1",
#     "marimo-studio==0.4.1",
#     "milume",
#     "scanpy>=1.10",
#     "squidpy>=1.6"
# ]
# [tool.marimo-studio]
# default = "docs"
# runtimes = ["server", "zero-python"]
#
# [tool.marimo-studio.cells]
# cell-1 = {ref = "cell:v1:b43fb1ce723e6ba8b0856f2881cdd133d48db94855bdb057e71e54775dc9b0cf:d7708ec00ead9434feb672ca4ade6025d725970c1aa27aca100ca4c6c1e2aadb:0"}
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

        > **Static docs view:** this page replays a **prepared** export state (fixed
        > selection and niche colouring). To draw new selections or re-run Squidpy
        > on changed regions, use **Open in molab** above.
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
def landmark_map(adata, run_niche_recipe, w):
    niche_col = run_niche_recipe(adata, w, "patch")
    w.color = niche_col
    w
    return (niche_col, w)


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
