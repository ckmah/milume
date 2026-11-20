# /// script
# requires-python = ">=3.11,<3.15"
# dependencies = [
#     "marimo>=0.25.1",
#     "marimo-studio==0.4.1",
#     "matplotlib>=3.8",
#     "milume",
#     "numpy",
#     "pandas",
#     "scanpy>=1.10",
#     "squidpy>=1.8.2,<1.9"
# ]
# [tool.marimo-studio]
# default = "docs"
# runtimes = ["server", "zero-python"]
# ///
"""Is a gene patterned, or are its cells? One Moran's I, three inputs."""

import marimo

__generated_with = "0.25.2"
app = marimo.App(width="medium")


@app.cell
def imports():
    import warnings

    # scanpy's __version__ warns while marimo hashes the result cell.
    warnings.filterwarnings(
        "ignore",
        category=FutureWarning,
        message=r"`__version__` is deprecated",
    )

    import marimo as mo
    import matplotlib.pyplot as plt
    import milume as ml
    import numpy as np
    import pandas as pd
    import scanpy as sc
    import squidpy as sq

    return ml, mo, np, pd, plt, sc, sq


@app.cell(hide_code=True)
def run_on_server_tip(mo):
    run_s = 25
    mo.vstack(
        [
            mo.md(
                r"""
                > **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook. After the server connects, click **Run all** (the ▶ button at the bottom right) to run the notebook.
                """
            ),
            mo.md(
                f"""
                This run takes about **{run_s} seconds**. The slow step is Moran's I on all cells.
                """
            ),
        ]
    )
    return


@app.cell
def load_adata(ml):
    # Your data: AnnData with obsm["spatial"] and a cell-type column
    adata = ml.ds.ileum_merfish_xu2026()
    return (adata,)


@app.cell
def analysis(adata, np, pd, sc, sq):
    N_NEIGHS = 6
    PERCENTILE = 99
    CELL_TYPE = "Enterocyte (top)"
    MIN_DETECT = 0.05
    TOP_N = 20

    sq.gr.spatial_neighbors_knn(adata, n_neighs=N_NEIGHS, percentile=PERCENTILE)
    moran_all = sq.gr.spatial_autocorr(adata, mode="moran", n_perms=None, copy=True)

    onehot = pd.get_dummies(adata.obs["cell_type"])
    A = adata.obsp["spatial_connectivities"].tocsr()
    row_sum = np.asarray(A.sum(axis=1)).ravel()
    row_sum = np.where(row_sum == 0, 1.0, row_sum)
    A_norm = A.copy()
    A_norm.data = A_norm.data / np.repeat(row_sum, np.diff(A_norm.indptr))
    neighbor_mix = pd.DataFrame(
        A_norm @ onehot.to_numpy(dtype=np.float64),
        index=adata.obs_names,
        columns=onehot.columns,
    )
    # One level out of each block, or the own-type and neighbor blocks are singular.
    drop = adata.obs["cell_type"].value_counts().idxmax()
    own = onehot.drop(columns=[drop]).astype(np.float64).add_prefix("own_")
    neigh = neighbor_mix.drop(columns=[drop]).astype(np.float64).add_prefix("nb_")
    covariates = pd.concat([own, neigh], axis=1)

    resid = adata.copy()
    resid.obs = pd.concat([resid.obs, covariates], axis=1)
    sc.pp.regress_out(resid, list(covariates.columns))
    moran_resid = sq.gr.spatial_autocorr(resid, mode="moran", n_perms=None, copy=True)

    same_type = adata[adata.obs["cell_type"] == CELL_TYPE].copy()
    sq.gr.spatial_neighbors_knn(same_type, n_neighs=N_NEIGHS, percentile=PERCENTILE)
    detected = np.asarray((same_type.X > 0).mean(axis=0)).ravel()
    same_type = same_type[:, detected >= MIN_DETECT].copy()
    moran_within = sq.gr.spatial_autocorr(
        same_type, mode="moran", n_perms=None, copy=True
    )

    scores = pd.DataFrame(
        {
            "gene": moran_all.index.astype(str),
            "I_all": moran_all["I"].to_numpy(),
            "I_resid": moran_resid["I"].reindex(moran_all.index).to_numpy(),
        }
    )
    scores["I_within"] = moran_within["I"].reindex(scores["gene"]).to_numpy()
    ranked = scores.sort_values("I_all", ascending=False)
    top = ranked.head(TOP_N)
    n_drop = int((top["I_resid"] < 0.5 * top["I_all"]).sum())
    top_all = str(ranked.iloc[0]["gene"])
    top_resid = str(scores.loc[scores["I_resid"].idxmax(), "gene"])
    n_cells = f"{adata.n_obs:,}"
    return (
        CELL_TYPE,
        N_NEIGHS,
        TOP_N,
        n_cells,
        n_drop,
        scores,
        top_all,
        top_resid,
    )


@app.cell(hide_code=True)
def intro(CELL_TYPE, N_NEIGHS, mo, n_cells, top_all, top_resid):
    mo.md(f"""
    # Is this gene patterned, or are its cells?

    Spatially variable gene tests rank genes by how clumped their expression is on the tissue. But cell types clump too. If a gene is made only by enterocytes, and enterocytes line the villus tips, the gene will look patterned even if every enterocyte expresses it the same way. Most of a top list can be cell layout in disguise.

    /// note | One test, three inputs
    [Yan, Hua & Li (2025)](https://doi.org/10.1038/s41467-025-56080-w) sort spatially variable genes into kinds, including **overall** and **cell-type-specific**. You don't need a different method for each kind. You need one test, fed three different things.
    ///

    We use one mouse ileum slice from [Xu et al. (2026)](https://doi.org/10.1016/j.chom.2026.01.018) (MERFISH, {n_cells} cells).

    The test is **Moran's I** ([Moran 1950](https://doi.org/10.2307/2332142), via [Squidpy](https://doi.org/10.1038/s41592-021-01346-7)). It asks whether neighboring cells have similar expression. Think of a seating chart: Moran's I is high when people who sit together wear the same color. We ask it three ways:

    1. **All cells.** Is the gene patterned anywhere?
    2. **Leftover expression.** Remove what each cell's own type and its neighbors' types predict, then test what's left. Is it patterned beyond tissue makeup? Using the neighborhood as a covariate follows [Liu & Li (2026)](https://doi.org/10.1038/s41588-026-02813-6).
    3. **One cell type.** Keep only {CELL_TYPE} cells. Does the gene vary among cells of the same kind?

    /// note | Reading the scores
    A gene that scores high in 1 but drops to zero in 2 is cell layout. A gene that stays high in 2 or 3 has spatial biology of its own.
    ///

    /// tip | Try it
    Color the map by a top all-cells gene like {top_all}, then by a top leftover gene like {top_resid}. Lasso a few regions and compare.
    ///

    /// warning | Caveat
    Moran's I sees one scale, set by {N_NEIGHS} neighbors, and rare cell types give small, noisy subsets. When you need a proper statistical test, use a dedicated method like nnSVG or SPARK.
    ///

    [![Open in molab](https://marimo.io/molab-shield.svg)](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_svg.py)
    """)
    return


@app.cell
def landmark_map(adata, ml, mo):
    w = mo.ui.anywidget(ml.peek(adata, color="cell_type"))
    w
    return (w,)


@app.cell
def result(CELL_TYPE, adata, mo, np, plt, scores, w):
    gene = str(w.color) if str(w.color) in set(scores["gene"]) else None
    selections = list(w.selections or [])

    def _scatter():
        finite = scores.replace([np.inf, -np.inf], np.nan).dropna(subset=["I_all", "I_resid"])
        fig, ax = plt.subplots(figsize=(6.2, 4.4))
        ax.scatter(finite["I_all"], finite["I_resid"], s=8, c="0.75", linewidths=0)
        row = finite.loc[finite["gene"] == gene].iloc[0]
        ax.scatter([row["I_all"]], [row["I_resid"]], s=36, c="C0", zorder=3)
        ax.annotate(
            gene,
            (row["I_all"], row["I_resid"]),
            textcoords="offset points",
            xytext=(6, 6),
        )
        ax.set_xlabel("I_all")
        ax.set_ylabel("I_resid")
        ax.set_title(f"{gene}: all cells vs leftover")
        fig.tight_layout()
        return fig

    def _panels():
        groups = []
        values = []
        for sel in selections:
            sel_id = str(sel["id"])
            label = str(sel.get("name") or sel_id)
            names = w.get_obs_names(sel_id)
            sub = adata[names]
            sub = sub[sub.obs["cell_type"] == CELL_TYPE]
            if sub.n_obs and gene is not None:
                raw = sub[:, gene].X
                expr = np.asarray(raw.toarray() if hasattr(raw, "toarray") else raw).ravel()
            else:
                expr = np.asarray([], dtype=float)
            xy = np.asarray(sub.obsm["spatial"]) if sub.n_obs else np.empty((0, 2))
            groups.append((label, xy, expr))
            if expr.size:
                values.append(expr)
        if values:
            vmin = float(min(np.min(v) for v in values))
            vmax = float(max(np.max(v) for v in values))
            if vmin == vmax:
                vmax = vmin + 1.0
        else:
            vmin, vmax = 0.0, 1.0
        n_sel = len(groups)
        fig, axes = plt.subplots(
            1,
            n_sel,
            figsize=(3.4 * n_sel, 3.6),
            squeeze=False,
            sharex=True,
            sharey=True,
            layout="constrained",
        )
        last = None
        for ax, (label, xy, expr) in zip(axes[0], groups):
            if expr.size:
                last = ax.scatter(
                    xy[:, 0],
                    xy[:, 1],
                    c=expr,
                    s=8,
                    cmap="viridis",
                    vmin=vmin,
                    vmax=vmax,
                    linewidths=0,
                )
            ax.set_aspect("equal")
            ax.set_title(f"{label}\n{CELL_TYPE} n={expr.size}")
        if last is not None:
            fig.colorbar(last, ax=axes[0].tolist(), label=gene, shrink=0.8)
        fig.suptitle(f"{gene} inside {CELL_TYPE}, one panel per lasso")
        return fig

    blocks = []
    if gene is not None:
        blocks.append(_scatter())
    if not selections:
        blocks.append(
            mo.md("Draw one or more lassos on the map, then re-run this cell.")
        )
    elif gene is not None:
        blocks.append(_panels())
    else:
        blocks.append(mo.md(f"Color the map by a gene to compare it inside {CELL_TYPE}."))
    mo.vstack(blocks) if len(blocks) > 1 else blocks[0]
    return


@app.cell(hide_code=True)
def takeaway(TOP_N, mo, n_drop, top_resid):
    mo.md(f"""
    {n_drop} of the top {TOP_N} all-cells genes lose most of their score once cell type and neighbors are removed. The ones that keep it, like {top_resid}, are where to look next.
    """)
    return


if __name__ == "__main__":
    app.run()
