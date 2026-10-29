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
# cell-1 = {ref = "cell:v1:ac9d65452a3ee9f1e66592ca0791a889cb86f6b51daf0b5ffdf712e6762740a5:9885a7dd0680394dfb142fdd21f39dd0bce5bf3e8e6f89c1111ec948a6df56f9:0"}
# ///
"""Squidpy niche colour recipe for docs (marimo-studio zero-python export)."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        # Squidpy niche labels

        Recolour Landmarks from Squidpy neighborhood niches on the Xu 2026 ileum
        slice (`demos/data/ileum.h5ad`, 16-gene panel).

        **Open in molab:**
        [squidpy_color.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_color.py)

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
        docs_recipe_adata,
        docs_recipe_patch_selection,
        niche_obs_key,
        run_niche_recipe,
    )

    return (
        docs_recipe_adata,
        docs_recipe_patch_selection,
        milume,
        mo,
        niche_obs_key,
        pd,
        run_niche_recipe,
        sc,
        sq,
    )


@app.cell
def _(docs_recipe_adata):
    adata = docs_recipe_adata()
    return (adata,)


@app.cell
def _(adata, docs_recipe_patch_selection, milume):
    w = milume.peek(adata, color="cell_type")
    w.selections = [docs_recipe_patch_selection(adata)]
    return (w,)


@app.cell
def landmark_map(adata, run_niche_recipe, w):
    import contextlib
    import io
    import logging
    import warnings

    from scipy.sparse import SparseEfficiencyWarning

    _loggers = [logging.getLogger(name) for name in ("scanpy", "squidpy", "leidenalg", "igraph")]
    _levels = [lg.level for lg in _loggers]
    for lg in _loggers:
        lg.setLevel(logging.ERROR)
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", category=FutureWarning)
                warnings.simplefilter("ignore", category=SparseEfficiencyWarning)
                niche_col = run_niche_recipe(adata, w, "patch")
    finally:
        for lg, level in zip(_loggers, _levels, strict=True):
            lg.setLevel(level)

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
