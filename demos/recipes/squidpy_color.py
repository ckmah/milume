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
# cell-1 = {ref = "cell:v1:8cb1616a5cbc282dfcbed9e229d0dd6566c77702105750b46ff19265d0b1529c:206f83756f9ae25a179491c17bdfeb1726c9d4a1ae1a555ab1b4882d58bfd09f:0"}
# cell-2 = {ref = "cell:v1:34bf30d7c701e58e846cb3e6a3e6ef5d01f3d9b042be0a125354f994603f0129:f0caf9a8dcba3f85135816af4caf0db5fa161bdb3552eea6c45406462610f644:0"}
# ///
"""Squidpy niche color recipe for docs (marimo-studio zero-python export)."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    from demos.recipes import squidpy_color_numbers as prose_nums

    mo.md(
        f"""
        # Squidpy niche labels

        Recolor Landmarks from Squidpy neighborhood niches on the Xu ileum
        slice (`demos/data/ileum.h5ad`, {prose_nums.DATASET_GENE_COUNT:,d}-gene section,
        {prose_nums.DATASET_CELL_COUNT:,d} cells).

        **Open in molab:**
        [squidpy_color.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_color.py)

        > **Static docs view:** this page replays a **prepared** export state (fixed
        > selection and niche coloring). To draw new selections or re-run Squidpy
        > on changed regions, use **Open in molab** above.
        """
    )
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    > **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook. After the server connects, click **Run all** (the ▶ button at the bottom right) to run the notebook.
    """)
    return


@app.cell
def _():
    import importlib.util
    import marimo as mo
    from pathlib import Path

    import milume
    import pandas as pd
    import scanpy as sc
    import squidpy as sq

    _helpers_path = Path(__file__).resolve().parent / "squidpy_color_helpers.py"
    _spec = importlib.util.spec_from_file_location("_squidpy_color_helpers", _helpers_path)
    _helpers = importlib.util.module_from_spec(_spec)
    assert _spec.loader is not None
    _spec.loader.exec_module(_helpers)
    docs_recipe_adata = _helpers.docs_recipe_adata
    docs_recipe_patch_selection = _helpers.docs_recipe_patch_selection
    niche_obs_key = _helpers.niche_obs_key
    run_niche_recipe = _helpers.run_niche_recipe

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
def landmark_map(adata, mo, niche_obs_key, run_niche_recipe, w):
    import contextlib
    import io
    import json
    import logging
    import os
    import warnings
    from pathlib import Path as _Path

    from demos.recipes import squidpy_color_numbers as compute_nums
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

    meta_mode = mo.app_meta().mode
    if os.environ.get("MILUME_RECIPE_WRITE_NUMBERS", "").lower() in ("1", "true", "yes") or meta_mode == "script":
        numbers = {
            "dataset_gene_count": compute_nums.DATASET_GENE_COUNT,
            "dataset_cell_count": compute_nums.DATASET_CELL_COUNT,
            "patch_size_um": compute_nums.PATCH_SIZE_UM,
            "niche_resolution": compute_nums.NICHE_RESOLUTION,
            "niche_n_neighbors": compute_nums.NICHE_N_NEIGHBORS,
            "niche_obs_key_expected": niche_obs_key(compute_nums.NICHE_RESOLUTION),
            "niche_obs_key_actual": niche_col,
            "selection_count": len(w.selections or []),
            "adata_n_obs": int(adata.n_obs),
            "adata_n_vars": int(adata.n_vars),
            "color_column_initial": "cell_type",
            "active_category": str(getattr(w, "active_category", "") or ""),
        }
        out = _Path(
            os.environ.get(
                "MILUME_RECIPE_NUMBERS_OUT",
                str(_Path(__file__).resolve().parent / "squidpy_color" / "numbers.json"),
            )
        )
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(numbers, indent=2, sort_keys=True) + "\n", encoding="utf-8")

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
