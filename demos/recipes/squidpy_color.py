# /// script
# requires-python = ">=3.11,<3.15"
# dependencies = [
#     "leidenalg>=0.12",
#     "marimo>=0.25.1",
#     "marimo-studio==0.4.1",
#     "matplotlib>=3.8",
#     "milume",
#     "pyarrow>=15",
#     "squidpy>=1.6"
# ]
# [tool.marimo-studio]
# default = "docs"
# runtimes = ["server", "zero-python"]
# ///
"""Squidpy neighborhood niche recipe for docs (marimo-studio zero-python export)."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def recipe_config():
    import importlib
    import sys
    from pathlib import Path

    import marimo as mo
    import matplotlib.pyplot as plt
    import milume as ml
    import numpy as np
    import pandas as pd
    import squidpy as sq

    _PKG_ROOT = Path(ml.__file__).resolve().parent
    _REPO_ROOT = _PKG_ROOT.parent
    _numbers_path = _REPO_ROOT / "demos" / "recipes" / "squidpy_color_numbers.py"
    if not _numbers_path.is_file():
        raise FileNotFoundError(f"missing {_numbers_path}")
    _num_spec = importlib.util.spec_from_file_location("squidpy_color_numbers", _numbers_path)
    if _num_spec is None or _num_spec.loader is None:
        raise ImportError(f"cannot load {_numbers_path}")
    _nums = importlib.util.module_from_spec(_num_spec)
    sys.modules[_num_spec.name] = _nums
    _num_spec.loader.exec_module(_nums)
    NICHE_KS = _nums.NICHE_KS
    NICHE_RESOLUTIONS = _nums.NICHE_RESOLUTIONS
    DEFAULT_NICHE_COLOR = _nums.DEFAULT_NICHE_COLOR
    NICHE_N_NEIGHBORS = _nums.NICHE_N_NEIGHBORS
    NICHE_RNG = _nums.NICHE_RNG
    write_recipe_numbers = _nums.write_numbers
    RECIPE_DATA_DIR = _REPO_ROOT / "demos" / "data"
    NICHE_CACHE_PATH = RECIPE_DATA_DIR / "ileum_niche_recipe_niches.parquet"
    ILEUM_H5AD = RECIPE_DATA_DIR / "ileum.h5ad"
    _science_path = _REPO_ROOT / "scripts" / "ileum_niche_recipe_science.py"
    if not _science_path.is_file():
        raise FileNotFoundError(f"missing {_science_path}")
    _spec = importlib.util.spec_from_file_location("ileum_niche_recipe_science_cfg", _science_path)
    if _spec is None or _spec.loader is None:
        raise ImportError(f"cannot load {_science_path}")
    _science_mod = importlib.util.module_from_spec(_spec)
    sys.modules[_spec.name] = _science_mod
    _spec.loader.exec_module(_science_mod)
    _niche_neighborhood = _science_mod._niche_neighborhood
    return (
        DEFAULT_NICHE_COLOR,
        NICHE_KS,
        NICHE_N_NEIGHBORS,
        NICHE_RESOLUTIONS,
        NICHE_RNG,
        Path,
        write_recipe_numbers,
        ILEUM_H5AD,
        NICHE_CACHE_PATH,
        RECIPE_DATA_DIR,
        _REPO_ROOT,
        _niche_neighborhood,
        importlib,
        ml,
        mo,
        np,
        pd,
        plt,
        sq,
        sys,
    )


@app.cell(hide_code=True)
def run_on_server_tip(mo):
    mo.md(
        r"""
        > **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook. After the server connects, click **Run all** (the ▶ button at the bottom right) to run the notebook.
        """
    )
    return


@app.cell(hide_code=True)
def load_adata(
    Path,
    ILEUM_H5AD,
    NICHE_CACHE_PATH,
    RECIPE_DATA_DIR,
    _REPO_ROOT,
    ml,
    NICHE_KS,
    NICHE_RESOLUTIONS,
    pd,
):
    ileum = ILEUM_H5AD if ILEUM_H5AD.is_file() else Path("demos/data/ileum.h5ad")
    if not ileum.is_file():
        raise FileNotFoundError(
            f"ileum tier missing: tried {ILEUM_H5AD} and demos/data/ileum.h5ad (cwd={Path.cwd()})"
        )
    adata = ml.ds.ileum_merfish_xu2026(path=ileum)
    cache = NICHE_CACHE_PATH if NICHE_CACHE_PATH.is_file() else RECIPE_DATA_DIR / "ileum_niche_recipe_niches.parquet"
    if not cache.is_file():
        cache = Path("demos/data/ileum_niche_recipe_niches.parquet")
    expected = [f"niche_k{k}_res{r}" for k in NICHE_KS for r in NICHE_RESOLUTIONS]
    if not cache.is_file():
        raise FileNotFoundError(f"niche cache missing: tried {NICHE_CACHE_PATH} and {cache}")
    cached = pd.read_parquet(cache)
    for col in expected:
        adata.obs[col] = cached[col].astype("category")
    return adata, cache, expected


@app.cell(hide_code=True)
def recipe_intro(adata, cache, importlib, mo, sys):
    _repo_root = cache.resolve().parent.parent.parent
    _science_path = _repo_root / "scripts" / "ileum_niche_recipe_science.py"
    if not _science_path.is_file():
        raise FileNotFoundError(f"missing {_science_path} (from cache {cache})")
    _spec = importlib.util.spec_from_file_location("ileum_niche_recipe_science", _science_path)
    if _spec is None or _spec.loader is None:
        raise ImportError(f"cannot load {_science_path}")
    _mod = importlib.util.module_from_spec(_spec)
    sys.modules[_spec.name] = _mod
    _spec.loader.exec_module(_mod)
    mo.md(_mod.format_intro_markdown(_mod.page_contrast_stats(adata)))
    return


@app.cell(hide_code=True)
def niche_sweep_method(NICHE_KS, NICHE_N_NEIGHBORS, NICHE_RESOLUTIONS, NICHE_RNG, mo):
    _k_lo, _k_hi = NICHE_KS
    _resolution = NICHE_RESOLUTIONS[0]
    mo.md(
        f"""
        ## Niche sweep (Squidpy)

        The loop below writes one `niche_k{{k}}_res{_resolution}` column per neighborhood size `k`
        (**{_k_lo}** and **{_k_hi}**) at fixed Leiden resolution **{_resolution}**. On this static page the
        columns are **precomputed**; in molab, re-run the cell after you change the cache
        path or delete the parquet file.

        ```python
        for k in NICHE_KS:
            sq.gr.spatial_neighbors(adata, coord_type="generic", n_neighs=k)
            _niche_neighborhood(
                adata,
                groups="cell_type",
                scale=False,
                n_neighbors={NICHE_N_NEIGHBORS},
                resolutions=list(NICHE_RESOLUTIONS),
                rng={NICHE_RNG},
            )
            adata.obs[f"niche_k{{k}}_res{_resolution}"] = adata.obs["nhood_niche_res={_resolution}"].astype(str)
        ```
        """
    )
    return


@app.cell
def niche_sweep(
    NICHE_KS,
    NICHE_N_NEIGHBORS,
    NICHE_RESOLUTIONS,
    NICHE_RNG,
    _niche_neighborhood,
    adata,
    cache,
    expected,
    pd,
    sq,
):
    if not all(col in adata.obs for col in expected):
        frames = {}
        for k in NICHE_KS:
            sq.gr.spatial_neighbors(adata, coord_type="generic", n_neighs=k)
            _niche_neighborhood(
                adata,
                groups="cell_type",
                scale=False,
                n_neighbors=NICHE_N_NEIGHBORS,
                resolutions=list(NICHE_RESOLUTIONS),
                rng=NICHE_RNG,
            )
            for r in NICHE_RESOLUTIONS:
                src = f"nhood_niche_res={r}"
                dst = f"niche_k{k}_res{r}"
                adata.obs[dst] = adata.obs[src].astype(str).astype("category")
                frames[dst] = adata.obs[dst]
        cache.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(frames, index=adata.obs_names).to_parquet(cache)
    return


@app.cell
def landmark_map(
    DEFAULT_NICHE_COLOR,
    adata,
    cache,
    expected,
    importlib,
    ml,
    mo,
    sys,
    write_recipe_numbers,
):
    import os
    from pathlib import Path as _Path
    _repo_root = cache.resolve().parent.parent.parent
    _science_path = _repo_root / "scripts" / "ileum_niche_recipe_science.py"
    if not _science_path.is_file():
        raise FileNotFoundError(f"missing {_science_path} (from cache {cache})")
    _spec = importlib.util.spec_from_file_location("ileum_niche_recipe_science_landmark", _science_path)
    if _spec is None or _spec.loader is None:
        raise ImportError(f"cannot load {_science_path}")
    _mod = importlib.util.module_from_spec(_spec)
    sys.modules[_spec.name] = _mod
    _spec.loader.exec_module(_mod)
    galt_lasso_vertices = _mod.GALT_FOLLICLE_LASSO_VERTICES
    galt_point_indices = list(_mod.GALT_FOLLICLE_POINT_INDICES)

    adata_map = adata.copy()
    adata_map.obs = adata_map.obs[["cell_type", *expected]].copy()

    w = mo.ui.anywidget(
        ml.peek(
            adata_map,
            color=DEFAULT_NICHE_COLOR,
        )
    )
    w.selections = [
        {
            "id": "galt-follicle",
            "type": "polygon",
            "vertices": galt_lasso_vertices,
            "point_indices": galt_point_indices,
        }
    ]
    meta_mode = mo.app_meta().mode
    if os.environ.get("MILUME_RECIPE_WRITE_NUMBERS", "").lower() in ("1", "true", "yes") or meta_mode == "script":
        out = _Path(
            os.environ.get(
                "MILUME_RECIPE_NUMBERS_OUT",
                str(cache.resolve().parent.parent / "recipes" / "squidpy_color" / "numbers.json"),
            )
        )
        write_recipe_numbers(
            adata,
            color=w.color,
            selection_count=len(w.selections or []),
            path=out,
        )
    w
    return (w,)


@app.cell(hide_code=True)
def molab_rerun_tip(DEFAULT_NICHE_COLOR, NICHE_KS, mo):
    _k_hi = NICHE_KS[-1]
    mo.md(
        f"""
        > **molab:** Re-run **`landmark_map`** and the composition cell after you change
        > the categorical column or draw a new lasso. The static export keeps the default
        > **`{DEFAULT_NICHE_COLOR}`** column, full-slice fit, and the compact GALT selection
        > available without focusing it (use the layers list to focus it for a follicle
        > crop on the orange k{_k_hi} blob).
        """
    )
    return


@app.cell
def niche_composition(adata, np, pd, plt, w):
    niche_col = w.color
    sel_ids = [s["id"] for s in w.selections]
    obs_names = w.get_obs_names(sel_ids[0]) if sel_ids else adata.obs_names
    sub = adata.obs.loc[obs_names, ["cell_type", niche_col]]
    ct = pd.crosstab(sub[niche_col], sub["cell_type"])
    ct = ct.loc[ct.sum(axis=1).sort_values(ascending=False).index]
    top_types = ct.sum(axis=0).sort_values(ascending=False).head(12).index
    ct = ct[top_types]
    fig, ax = plt.subplots(figsize=(7.5, max(2.0, 0.35 * len(ct))))
    left = np.zeros(len(ct))
    colors = plt.cm.tab20(np.linspace(0, 1, len(top_types)))
    y = np.arange(len(ct))
    for idx, cell_type in enumerate(top_types):
        vals = ct[cell_type].to_numpy()
        ax.barh(y, vals, left=left, label=cell_type, color=colors[idx])
        left = left + vals
    ax.set_yticks(y)
    ax.set_yticklabels([f"niche {idx}" for idx in ct.index.astype(str)])
    ax.set_xlabel("cells in selection")
    ax.set_title(f"Cell-type mix per niche ({niche_col}, selection={sel_ids[0] if sel_ids else 'all'})")
    ax.legend(bbox_to_anchor=(1.02, 1), loc="upper left", fontsize=8)
    fig.tight_layout()
    fig
    return


if __name__ == "__main__":
    app.run()
