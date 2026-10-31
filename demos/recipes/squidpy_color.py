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
#
# [tool.marimo-studio.cells]
# cell-1 = {ref = "cell:v1:4f29e60d37a0a74c949d66ac61ff7aa38b2de28a02aea5f012869898b3ec16bb:4983be74aa5f1871fecfd6fc7115804b62217632fcd759ee3ce412529cf5a9ba:0"}
# ///
"""Squidpy neighborhood niche recipe for docs (marimo-studio zero-python export)."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def recipe_config():
    from pathlib import Path

    import marimo as mo
    import matplotlib.pyplot as plt
    import milume as ml
    import numpy as np
    import pandas as pd
    import squidpy as sq

    NICHE_KS = (8, 15, 30)
    NICHE_RESOLUTIONS = (0.3, 0.5, 1.0)
    DEFAULT_NICHE_COLOR = "niche_k30_res0.3"
    FOLLICLE_X_BOUNDS = (-4160.0, -3740.0)
    FOLLICLE_Y_BOUNDS = (1100.0, 1500.0)
    _PKG_ROOT = Path(ml.__file__).resolve().parent
    _REPO_ROOT = _PKG_ROOT.parent
    RECIPE_DATA_DIR = _REPO_ROOT / "demos" / "data"
    NICHE_CACHE_PATH = RECIPE_DATA_DIR / "ileum_niche_recipe_niches.parquet"
    ILEUM_H5AD = RECIPE_DATA_DIR / "ileum.h5ad"
    return (
        DEFAULT_NICHE_COLOR,
        FOLLICLE_X_BOUNDS,
        FOLLICLE_Y_BOUNDS,
        NICHE_KS,
        NICHE_RESOLUTIONS,
        Path,
        ILEUM_H5AD,
        NICHE_CACHE_PATH,
        RECIPE_DATA_DIR,
        ml,
        mo,
        np,
        pd,
        plt,
        sq,
    )


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        # Squidpy neighborhood niches on ileum GALT

        On this Xu 2026 ileum slice, does the gut-associated lymphoid tissue (GALT)
        follicle come out as its own Squidpy niche, or dissolve into lamina propria?
        **Neighbourhood size `k`** in `sq.gr.spatial_neighbors` decides it. We cluster
        with `groups="cell_type"` (cryptopatch / ILF-like cDC, ILC3, FRC aggregates,
        not classical B/T zones).

        **Open in molab:**
        [squidpy_color.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_color.py)

        > **Static docs view:** niches are **precomputed** and baked into the export.
        > Switch **`k` / resolution** columns in the widget categorical tab (no kernel).
        > The map is cropped to the follicle field of view below; molab loads the full slice.
        > The composition figure matches **`niche_k30_res0.3`** and the tutorial lasso.
        """
    )
    return


@app.cell(hide_code=True)
def _(mo):
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


@app.cell
def niche_sweep(NICHE_KS, NICHE_RESOLUTIONS, adata, cache, expected, pd, sq):
    def _calculate_niche_neighborhood(adata, **kwargs):
        fn = getattr(sq.gr, "calculate_niche_neighborhood", None)
        if fn is not None:
            return fn(adata, **kwargs)
        return sq.gr.calculate_niche(adata, flavor="neighborhood", **kwargs)

    if not all(col in adata.obs for col in expected):
        frames = {}
        for k in NICHE_KS:
            sq.gr.spatial_neighbors(adata, coord_type="generic", n_neighs=k)
            _calculate_niche_neighborhood(
                adata,
                groups="cell_type",
                scale=False,
                n_neighbors=15,
                resolutions=list(NICHE_RESOLUTIONS),
                random_state=0,
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
    FOLLICLE_X_BOUNDS,
    FOLLICLE_Y_BOUNDS,
    adata,
    expected,
    ml,
    mo,
):
    xy = adata.obsm["spatial"]
    fov = (
        (xy[:, 0] >= FOLLICLE_X_BOUNDS[0])
        & (xy[:, 0] <= FOLLICLE_X_BOUNDS[1])
        & (xy[:, 1] >= FOLLICLE_Y_BOUNDS[0])
        & (xy[:, 1] <= FOLLICLE_Y_BOUNDS[1])
    )
    adata_map = adata[fov].copy()
    adata_map.obs = adata_map.obs[["cell_type", *expected]].copy()
    galt_lasso_vertices = [
        [-3992.68, 1334.9],
        [-4012.99, 1290.28],
        [-4011.83, 1279.79],
        [-4009.53, 1273.14],
        [-3989.17, 1253.08],
        [-3976.01, 1246.48],
        [-3969.55, 1247.26],
        [-3944.06, 1256.34],
        [-3905.74, 1270.34],
        [-3000.04, 1679.67],
        [-2969.14, 1697.16],
        [-2961.4, 1715.74],
        [-2964.16, 1723.35],
        [-2983.99, 1747.98],
        [-3459.14, 1949.51],
    ]

    def _point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
        inside = False
        n = len(ring)
        for i in range(n):
            x0, y0 = ring[i]
            x1, y1 = ring[(i + 1) % n]
            if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0 + 1e-12) + x0:
                inside = not inside
        return inside

    spatial = adata_map.obsm["spatial"]
    galt_point_indices = [
        i
        for i, (x, y) in enumerate(spatial)
        if _point_in_ring(float(x), float(y), galt_lasso_vertices)
    ]

    w = mo.ui.anywidget(
        ml.peek(
            adata_map,
            color=DEFAULT_NICHE_COLOR,
        )
    )
    w.x_bounds = FOLLICLE_X_BOUNDS
    w.y_bounds = FOLLICLE_Y_BOUNDS
    w.selections = [
        {
            "id": "galt-follicle",
            "type": "polygon",
            "vertices": galt_lasso_vertices,
            "point_indices": galt_point_indices,
        }
    ]
    w.selected_kind = "selection"
    w.selected_index = 0
    w
    return (w,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        > **molab:** Re-run **`landmark_map`** and the composition cell after you change
        > the categorical column or draw a new lasso. The static page keeps the default
        > **`niche_k30_res0.3`** view and tutorial lasso frozen in the export.
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
