# /// script
# requires-python = ">=3.11,<3.15"
# dependencies = [
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
"""Squidpy Moran's I recipe for docs (marimo-studio zero-python export)."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        # Moran's I on the ileum

        On this Xu et al. 2026 ileum MERFISH slice, all-cell Moran's I ranks genes that vary in space because cell types sit in different places. Moran's I inside enterocytes asks which of those genes still vary along the crypt-villus axis within one class.

        Both runs use a 6-neighbour knn graph with edges above the 99th percentile removed, then Moran's I with 100 permutations.

        The all-cell top 20 and the enterocyte top 20 share {{TOP20_SHARED}} genes. The all-cell top 20 is {{ALL_TOP20}}. The enterocyte top 20 is {{ENTEROCYTE_TOP20}}.

        **Apob** stays high within enterocytes. All-cell I is {{APOB_I_ALL}}. Enterocyte I is {{APOB_I_ENTEROCYTE}}.

        **{{CONTRAST_GENE}}** is high across all cells and lower within enterocytes. All-cell I is {{CONTRAST_I_ALL}}. Enterocyte I is {{CONTRAST_I_ENTEROCYTE}}. Acta2 and Grem1 are the candidates for that contrast. A gene detected in under 5% of enterocytes has no enterocyte I, and the scatter marks it on the all-cell axis. Enterocyte subtypes are position-defined, so a single-subtype run is the stricter check.

        `n_counts` is an obs column. It is the per-cell total of `layers['raw_counts']`. The median on this slice is {{N_COUNTS_MEDIAN}}. Colour by `n_counts` when a spatial pattern might be a depth artifact.

        Yan, Hua, and Li, Nat Commun 2025, make this composition point. This page runs the same comparison with one fixed neighbour graph.
        [s41467-025-56080-w](https://www.nature.com/articles/s41467-025-56080-w)

        **Open in molab:**
        [squidpy_moran.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_moran.py)

        > **Static docs view.** Moran's I is precomputed in `ileum_moran_recipe_scores.parquet`. The map is the full slice, framed on the crypt-villus field, coloured by **Apob**. The scatter highlights the gene you pick. molab is where that pick is live.
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
def recipe_config():
    from pathlib import Path

    import marimo as mo
    import matplotlib.pyplot as plt
    import milume as ml
    import numpy as np
    import pandas as pd
    import squidpy as sq

    DEFAULT_GENE = "Apob"
    _PKG_ROOT = Path(ml.__file__).resolve().parent
    _REPO_ROOT = _PKG_ROOT.parent
    RECIPE_DATA_DIR = _REPO_ROOT / "demos" / "data"
    MORAN_CACHE_PATH = RECIPE_DATA_DIR / "ileum_moran_recipe_scores.parquet"
    ILEUM_H5AD = RECIPE_DATA_DIR / "ileum.h5ad"
    return (
        DEFAULT_GENE,
        ILEUM_H5AD,
        MORAN_CACHE_PATH,
        RECIPE_DATA_DIR,
        Path,
        ml,
        mo,
        np,
        pd,
        plt,
        sq,
    )


@app.cell(hide_code=True)
def load_adata(ILEUM_H5AD, MORAN_CACHE_PATH, Path, ml, np, pd):
    ileum = ILEUM_H5AD if ILEUM_H5AD.is_file() else Path("demos/data/ileum.h5ad")
    if not ileum.is_file():
        raise FileNotFoundError(
            f"ileum tier missing: tried {ILEUM_H5AD} and demos/data/ileum.h5ad (cwd={Path.cwd()})"
        )
    adata = ml.ds.ileum_merfish_xu2026(path=ileum)
    if "n_counts" not in adata.obs.columns:
        if "raw_counts" not in adata.layers:
            raise KeyError("n_counts is missing and layers['raw_counts'] is not on this AnnData")
        adata.obs["n_counts"] = np.asarray(adata.layers["raw_counts"].sum(axis=1)).ravel()

    cwd_cache = Path("demos/data/ileum_moran_recipe_scores.parquet")
    if MORAN_CACHE_PATH.is_file():
        cache = MORAN_CACHE_PATH
    elif cwd_cache.is_file():
        cache = cwd_cache
    elif MORAN_CACHE_PATH.parent.is_dir():
        cache = MORAN_CACHE_PATH
    else:
        cache = cwd_cache
    if cache.is_file():
        cached = pd.read_parquet(cache)
        needed = ("moran_I_all", "moran_I_enterocyte")
        if all(col in cached.columns for col in needed):
            for col in needed:
                adata.var[col] = cached[col]
    return adata, cache


@app.cell
def moran_setup(adata, cache, np, pd, sq):
    # percentile=99 drops long knn edges. Unpruned Delaunay reaches about 1 mm on this slice.
    needed = ("moran_I_all", "moran_I_enterocyte")
    if not all(col in adata.var.columns for col in needed):
        sq.gr.spatial_neighbors_knn(adata, n_neighs=6, percentile=99)
        sq.gr.spatial_autocorr(adata, mode="moran", n_perms=100, show_progress_bar=False)
        ent = adata[adata.obs.cell_type.str.startswith("Enterocyte")].copy()
        detected = np.asarray((ent.X > 0).sum(axis=0)).ravel() / ent.n_obs
        expressed = list(ent.var_names[detected >= 0.05])
        sq.gr.spatial_neighbors_knn(ent, n_neighs=6, percentile=99)
        sq.gr.spatial_autocorr(
            ent,
            genes=expressed,
            mode="moran",
            n_perms=100,
            show_progress_bar=False,
        )
        scores = pd.DataFrame(index=adata.var_names)
        scores["moran_I_all"] = adata.uns["moranI"]["I"]
        scores["moran_I_enterocyte"] = ent.uns["moranI"]["I"]
        for col in needed:
            adata.var[col] = scores[col]
        cache.parent.mkdir(parents=True, exist_ok=True)
        tmp = cache.with_suffix(".tmp")
        scores.to_parquet(tmp)
        tmp.replace(cache)
    return


@app.cell
def landmark_map(DEFAULT_GENE, adata, ml, mo, np):
    w = mo.ui.anywidget(
        ml.peek(
            adata,
            color=DEFAULT_GENE,
            genes=list(adata.var_names),
        )
    )
    w.color = DEFAULT_GENE
    xy = np.asarray(adata.obsm["spatial"])
    # Whole slice. ileum_2d shows the crypt-villus axis on this full field.
    w.x_bounds = (float(xy[:, 0].min()), float(xy[:, 0].max()))
    w.y_bounds = (float(xy[:, 1].min()), float(xy[:, 1].max()))
    traits = w.widget.traits() if hasattr(w, "widget") else w.traits()
    if "mesh_opacity" in traits:
        w.mesh_opacity = 0.6
    w
    return (w,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        > **molab:** Re-run **`moran_plots`** after you pick another gene. The static page keeps **Apob** and the pre-rendered scatter.
        """
    )
    return


@app.cell
def moran_plots(adata, np, pd, plt, w):
    gene = str(w.color)
    scores = adata.var[["moran_I_all", "moran_I_enterocyte"]]
    both = scores.dropna(subset=["moran_I_all", "moran_I_enterocyte"])
    n_types = int(adata.obs["cell_type"].nunique())
    fig, axes = plt.subplots(
        2,
        1,
        figsize=(8.0, 3.8 + 0.16 * n_types),
        layout="constrained",
        height_ratios=[3.8, max(0.16 * n_types, 1.0)],
    )
    ax = axes[0]
    ax.scatter(
        both["moran_I_all"],
        both["moran_I_enterocyte"],
        s=8,
        c="0.75",
        linewidths=0,
    )
    lo = float(min(both["moran_I_all"].min(), both["moran_I_enterocyte"].min()))
    hi = float(max(both["moran_I_all"].max(), both["moran_I_enterocyte"].max()))
    ax.plot([lo, hi], [lo, hi], color="0.45", linewidth=0.8)
    if gene in both.index:
        row = both.loc[gene]
        ax.scatter(
            [row["moran_I_all"]],
            [row["moran_I_enterocyte"]],
            s=36,
            c="#d62728",
            zorder=3,
        )
        ax.annotate(
            gene,
            (float(row["moran_I_all"]), float(row["moran_I_enterocyte"])),
            textcoords="offset points",
            xytext=(6, 4),
        )
    elif gene in scores.index and pd.isna(scores.at[gene, "moran_I_enterocyte"]):
        x_all = float(scores.at[gene, "moran_I_all"])
        ax.axvline(x_all, color="#d62728", linewidth=0.8)
        ax.annotate(
            f"{gene} not scored in enterocytes",
            (x_all, hi),
            textcoords="offset points",
            xytext=(6, -10),
        )
    ax.set_xlabel("Moran's I, all cells")
    ax.set_ylabel("Moran's I, enterocytes")
    ax.set_title("All cells vs enterocytes")

    ax = axes[1]
    if gene in adata.var_names:
        column = adata[:, gene].X
        if hasattr(column, "toarray"):
            values = np.asarray(column.toarray()).ravel()
        else:
            values = np.asarray(column).ravel()
        labels = adata.obs["cell_type"].astype(str).to_numpy()
        means = pd.Series(values).groupby(labels, sort=False).mean().sort_values(ascending=True)
        ax.barh(means.index.astype(str), means.to_numpy(), color="0.35")
        ax.tick_params(axis="y", labelsize=7)
        ax.set_xlabel("mean log expression")
        ax.set_title(gene)
    else:
        ax.set_axis_off()
        ax.text(0.0, 0.5, f"{gene} is not a gene", transform=ax.transAxes, va="center")
    fig
    return


if __name__ == "__main__":
    app.run()
