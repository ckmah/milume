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
#
# [tool.marimo-studio.cells]
# cell-1 = {ref = "cell:v1:9399ce6a7bcd075ea30072839e0d5ef7155064cac0d2497f8de11842d5665158:4143dabe6905293279e80b2e85b7f0e2c648fb43e12ab624fabaec716a07e91f:0"}
# cell-2 = {ref = "cell:v1:eaab100e38906edf9f943e261802946200da797e294fabac5e524181e4126256:f0caf9a8dcba3f85135816af4caf0db5fa161bdb3552eea6c45406462610f644:0"}
# cell-7 = {ref = "cell:v1:8b7a08944f047a0f5106146b0ed2a58122ea5446fc073c4f690e3671b1b94e5e:8841281c5f31d875cbf4cd89f18fca8ee33578edd01833bd8092d49354e8d2a1:0"}
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

        The all-cell top 20 and the enterocyte top 20 share **8** genes (Apob, Slc5a1, Nos2, Cps1, Nlrp6, Fgf15, Fzd5, Ephb2). All-cell ranks lead with **Acta2** and **Apob**; enterocyte ranks lead with **Apob** and **Slc5a1**.

        **Apob** stays high within enterocytes. All-cell I is **0.631**. Enterocyte I is **0.521**.

        **Acta2** is high across all cells (I **0.743**) and is not scored within enterocytes because it is detected in under 5% of enterocytes. The scatter marks such genes on the all-cell axis only. Enterocyte subtypes are position-defined, so a single-subtype run is the stricter check.

        `n_counts` is an obs column. It is the per-cell total of `layers['raw_counts']`. The median on this slice is **48**. Colour by `n_counts` when a spatial pattern might be a depth artifact.

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
    CRYPT_VILLUS_X_HALF_UM = 200.0
    _PKG_ROOT = Path(ml.__file__).resolve().parent
    _REPO_ROOT = _PKG_ROOT.parent
    RECIPE_DATA_DIR = _REPO_ROOT / "demos" / "data"
    MORAN_CACHE_PATH = RECIPE_DATA_DIR / "ileum_moran_recipe_scores.parquet"
    ILEUM_H5AD = RECIPE_DATA_DIR / "ileum.h5ad"
    return (
        DEFAULT_GENE,
        CRYPT_VILLUS_X_HALF_UM,
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
        if "moran_I_all" in cached.columns and "moran_I_enterocyte" in cached.columns:
            adata.var["moran_I_all"] = cached["moran_I_all"]
            adata.var["moran_I_enterocyte"] = cached["moran_I_enterocyte"]
    return adata, cache


@app.cell
def moran_setup(adata, cache, np, pd, sq):
    # percentile=99 drops long knn edges. Unpruned Delaunay reaches about 1 mm on this slice.
    if "moran_I_all" not in adata.var.columns or "moran_I_enterocyte" not in adata.var.columns:
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
        frame = pd.DataFrame(index=adata.var_names)
        frame["moran_I_all"] = adata.uns["moranI"]["I"]
        frame["moran_I_enterocyte"] = ent.uns["moranI"]["I"]
        adata.var["moran_I_all"] = frame["moran_I_all"]
        adata.var["moran_I_enterocyte"] = frame["moran_I_enterocyte"]
        cache.parent.mkdir(parents=True, exist_ok=True)
        tmp = cache.with_suffix(".tmp")
        frame.to_parquet(tmp)
        tmp.replace(cache)
    return


@app.cell
def landmark_map(CRYPT_VILLUS_X_HALF_UM, DEFAULT_GENE, adata, ml, mo, np):
    xy = np.asarray(adata.obsm["spatial"])
    mucosa = adata.obs["anatomical_layer"].astype(str).eq("Mucosa").to_numpy()
    x_mid = float(np.median(xy[mucosa, 0]))
    strip = mucosa & (xy[:, 0] >= x_mid - CRYPT_VILLUS_X_HALF_UM) & (
        xy[:, 0] <= x_mid + CRYPT_VILLUS_X_HALF_UM
    )
    adata_map = adata[strip].copy()
    adata_map.obs = adata_map.obs[["cell_type", "n_counts"]].copy()
    gene_list = list(adata_map.var_names)
    w = mo.ui.anywidget(
        ml.peek(
            adata_map,
            color=DEFAULT_GENE,
            genes=None,
        )
    )
    w.color = DEFAULT_GENE
    xs = xy[strip, 0]
    ys = xy[strip, 1]
    w.x_bounds = (float(xs.min()), float(xs.max()))
    w.y_bounds = (float(ys.min()), float(ys.max()))
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
    moran_scores = adata.var[["moran_I_all", "moran_I_enterocyte"]]
    both = moran_scores.dropna(subset=["moran_I_all", "moran_I_enterocyte"])
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
    elif gene in moran_scores.index and pd.isna(moran_scores.at[gene, "moran_I_enterocyte"]):
        x_all = float(moran_scores.at[gene, "moran_I_all"])
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
