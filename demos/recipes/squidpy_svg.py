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
    warnings.filterwarnings(
        "ignore",
        category=FutureWarning,
        message=r"Calling `spatial_neighbors` is deprecated",
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
    run_s = 40
    mo.vstack(
        [
            mo.md(
                r"""
                > **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook. After the server connects, click **Run all** (the ▶ button at the bottom right) to run the notebook.
                """
            ),
            mo.md(
                f"""
                This run takes about **{run_s} seconds**. The slow step is the spatial domain clustering.
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
    MIN_DETECT = 0.01
    TOP_N = 20
    DOMAIN_K = 30
    DOMAIN_NEIGHBORS = 15
    DOMAIN_RES = 0.3
    ENTEROCYTE = ["Enterocyte (bottom)", "Enterocyte (mid)", "Enterocyte (top)"]

    sq.gr.spatial_neighbors(adata, coord_type="generic", n_neighs=DOMAIN_K)
    if hasattr(sq.gr, "calculate_niche_neighborhood"):
        sq.gr.calculate_niche_neighborhood(
            adata,
            groups="cell_type",
            scale=False,
            n_neighbors=DOMAIN_NEIGHBORS,
            resolutions=[DOMAIN_RES],
            rng=0,
        )
    else:
        sq.gr.calculate_niche(
            adata,
            flavor="neighborhood",
            groups="cell_type",
            scale=False,
            n_neighbors=DOMAIN_NEIGHBORS,
            resolutions=[DOMAIN_RES],
            random_state=0,
        )
    niche_col = f"nhood_niche_res={DOMAIN_RES}"
    adata.obs["spatial domain"] = adata.obs[niche_col].astype(str)
    adata.obs.drop(columns=[niche_col], inplace=True)
    # The widget syncs every obsm matrix. This profile is 78 columns.
    del adata.obsm["niche_embedding"]

    sq.gr.spatial_neighbors_knn(adata, n_neighs=N_NEIGHS, percentile=PERCENTILE)
    keep_all = np.asarray((adata.X > 0).mean(axis=0)).ravel() >= MIN_DETECT
    scored = adata[:, keep_all].copy()
    moran_all = sq.gr.spatial_autocorr(scored, mode="moran", n_perms=None, copy=True)

    # One level out of each block, or the own-type and domain blocks are singular.
    own = pd.get_dummies(adata.obs["cell_type"]).astype(np.float64)
    own = own.drop(columns=[own.sum().idxmax()]).add_prefix("own_")
    domain = pd.get_dummies(adata.obs["spatial domain"]).astype(np.float64)
    domain = domain.drop(columns=[domain.sum().idxmax()]).add_prefix("domain_")
    covariates = pd.concat([own, domain], axis=1)

    keep_resid = keep_all
    resid = adata[:, keep_resid].copy()
    resid.obs = pd.concat([resid.obs, covariates], axis=1)
    sc.pp.regress_out(resid, list(covariates.columns))
    moran_resid = sq.gr.spatial_autocorr(resid, mode="moran", n_perms=None, copy=True)

    enterocytes = adata[adata.obs["cell_type"].isin(ENTEROCYTE)].copy()
    sq.gr.spatial_neighbors_knn(enterocytes, n_neighs=N_NEIGHS, percentile=PERCENTILE)
    keep_within = np.asarray((enterocytes.X > 0).mean(axis=0)).ravel() >= MIN_DETECT
    enterocytes_scored = enterocytes[:, keep_within].copy()
    moran_within = sq.gr.spatial_autocorr(
        enterocytes_scored, mode="moran", n_perms=None, copy=True
    )

    scores = pd.DataFrame(
        {
            "gene": moran_all.index.astype(str),
            "I_all": moran_all["I"].to_numpy(),
            "I_resid": moran_resid["I"].reindex(moran_all.index).to_numpy(),
        }
    )
    scores["I_within"] = moran_within["I"].reindex(scores["gene"]).to_numpy()
    scores["rank_all"] = scores["I_all"].rank(ascending=False, method="min")
    scores["rank_resid"] = scores["I_resid"].rank(ascending=False, method="min")
    top = scores.sort_values("I_all", ascending=False).head(TOP_N)
    n_drop = int((top["I_resid"] < 0.5 * top["I_all"]).sum())
    top_resid_row = top.sort_values("I_resid", ascending=False).iloc[0]
    n_cells = f"{adata.n_obs:,}"
    n_scored = int(keep_all.sum())
    n_within = int(keep_within.sum())
    n_domains = int(adata.obs["spatial domain"].nunique())

    def row(gene):
        return scores.loc[scores["gene"] == gene].iloc[0]

    acta2, apob, dhx58 = row("Acta2"), row("Apob"), row("Dhx58")
    ps = enterocytes.obs["mucosal_pseudospace"]
    low = ps <= ps.quantile(0.2)
    high = ps >= ps.quantile(0.8)

    def zonation(gene):
        raw = enterocytes[:, gene].X
        expr = pd.Series(
            np.asarray(raw.toarray() if hasattr(raw, "toarray") else raw).ravel(),
            index=enterocytes.obs_names,
        )
        return float(expr.corr(ps, method="spearman")), float(expr[low].mean()), float(expr[high].mean())

    apob_rho, apob_low, apob_high = zonation("Apob")
    nt5e_rho, nt5e_low, nt5e_high = zonation("Nt5e")
    cps1_rho, cps1_low, cps1_high = zonation("Cps1")
    dhx58_rho, _, _ = zonation("Dhx58")

    il22 = adata[:, "Il22ra2"].X
    il22_expr = np.asarray(il22.toarray() if hasattr(il22, "toarray") else il22).ravel()
    il22_n = int((il22_expr > 0).sum())
    il22_ent = enterocytes[:, "Il22ra2"].X
    il22_ent_expr = np.asarray(il22_ent.toarray() if hasattr(il22_ent, "toarray") else il22_ent).ravel()
    il22_ent_n = int((il22_ent_expr > 0).sum())
    graph = adata.obsp["spatial_connectivities"].tocsr().astype(np.float64)
    row_sum = np.asarray(graph.sum(axis=1)).ravel()
    scale = np.where(row_sum == 0, 1.0, row_sum)
    graph = graph.copy()
    graph.data = graph.data / np.repeat(scale, np.diff(graph.indptr))
    design = np.column_stack([np.ones(adata.n_obs), covariates.to_numpy(dtype=np.float64)])
    coef, *_ = np.linalg.lstsq(design, il22_expr, rcond=None)
    leftover = il22_expr - design @ coef
    z_all = il22_expr - il22_expr.mean()
    z_left = leftover - leftover.mean()
    s0 = float(graph.sum())
    il22_i_all = adata.n_obs / s0 * float(z_all @ (graph @ z_all)) / float(z_all @ z_all)
    il22_i_resid = adata.n_obs / s0 * float(z_left @ (graph @ z_left)) / float(z_left @ z_left)

    return (
        MIN_DETECT,
        TOP_N,
        acta2,
        apob,
        apob_high,
        apob_low,
        apob_rho,
        cps1_high,
        cps1_low,
        cps1_rho,
        dhx58,
        dhx58_rho,
        il22_i_all,
        il22_ent_n,
        il22_i_resid,
        il22_n,
        n_cells,
        n_domains,
        n_drop,
        n_scored,
        n_within,
        nt5e_high,
        nt5e_low,
        nt5e_rho,
        scores,
        top_resid_row,
    )


@app.cell(hide_code=True)
def intro(
    MIN_DETECT,
    acta2,
    apob,
    apob_high,
    apob_low,
    apob_rho,
    cps1_high,
    cps1_low,
    cps1_rho,
    dhx58,
    dhx58_rho,
    il22_ent_n,
    il22_i_all,
    il22_i_resid,
    il22_n,
    mo,
    n_cells,
    n_domains,
    n_scored,
    n_within,
    nt5e_high,
    nt5e_low,
    nt5e_rho,
):
    floor = f"{MIN_DETECT:.0%}"
    mo.md(f"""
    # Is this gene patterned, or are its cells?

    Spatially variable gene tests rank genes by how clumped their expression is on the tissue. But cell types clump too. If a gene is made only by enterocytes, and enterocytes line the villus tips, the gene will look patterned even if every enterocyte expresses it the same way. Most of a top list can be cell layout in disguise.

    /// note | One test, three inputs
    [Yan, Hua & Li (2025)](https://doi.org/10.1038/s41467-025-56080-w) sort spatially variable genes into kinds, including **overall** and **cell-type-specific**. You don't need a different method for each kind. You need one test, fed three different things.
    ///

    We use one mouse ileum slice from [Xu et al. (2026)](https://doi.org/10.1016/j.chom.2026.01.018) (MERFISH, {n_cells} cells). All-cell and leftover scores use the {n_scored} genes detected in at least {floor} of all cells. Within a cell type, the floor is {floor} of the cells in that selection. The pooled enterocytes clear {n_within} genes.

    The test is **Moran's I** ([Moran 1950](https://doi.org/10.2307/2332142), via [Squidpy](https://doi.org/10.1038/s41592-021-01346-7)). It asks whether neighboring cells have similar expression. Think of a seating chart. Moran's I is high when people who sit together wear the same color. We ask it three ways:

    1. **All cells.** Is the gene patterned anywhere?
    2. **Leftover expression.** Remove what each cell's own type and its spatial domain predict, then test what's left. The {n_domains} spatial domains are Squidpy neighborhood clusters on cell type, the same call as the niche recipe, labelled spatial domain. Positional labels such as Enterocyte (bottom), (mid), and (top) stay as Xu annotated them. Using domain as a covariate follows [Liu & Li (2026)](https://doi.org/10.1038/s41588-026-02813-6).
    3. **One cell type.** Select the cell type in the widget before coloring a cell-type-specific gene. That selection is the context.

    /// warning | Enterocyte subtypes are positions
    Xu et al. split enterocytes into bottom, mid and top by where they sit along the villus, not by an independent marker. Those labels already carry the villus gradient. When the leftover score regresses out cell type, it also regresses out position, so zonated genes like Apob lose most of their score by construction rather than because they lack a pattern. The same goes for testing within "Enterocyte (top)" alone: that slice covers only a thin band of the villus, so a gradient has little room to show. To see zonation, select all three enterocyte subtypes together, then color Apob.
    ///

    /// note | Reading the scores
    A gene that scores high in 1 but drops to zero in 2 is cell layout. A gene that stays high in 2 or 3 has spatial biology of its own.
    ///

    /// tip | Try it
    Select the cell type in the widget first when the gene belongs to one kind of cell, then color the gene.

    **Acta2** is cell layout. On all cells it is rank {int(acta2["rank_all"])} (I = {acta2["I_all"]:.2f}). Leftover I is {acta2["I_resid"]:.2f}, and inside enterocytes it is {acta2["I_within"]:.2f}.

    **Apob** is a villus gradient inside enterocytes. Select the enterocyte positions, then color Apob. Within those cells, pooled without merging the bottom, mid, and top labels, I = {apob["I_within"]:.2f}. Expression rises toward the villus tip (Spearman {apob_rho:.2f} with `mucosal_pseudospace`, mean {apob_low:.2f} in the bottom fifth and {apob_high:.2f} in the top fifth). In enterocytes, Apob mRNA increases toward the villus tip as part of the upper-villus chylomicron program; Nt5e/Cd73 marks the sharper extreme-tip program ([Moor et al. 2018](https://doi.org/10.1016/j.cell.2018.08.063), [Beumer et al. 2022](https://doi.org/10.1016/j.celrep.2022.110438), [Manco et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8144370/), [Xu et al. 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12927598/)).

    **Dhx58** is patchy beyond cell makeup. It moves from rank {int(dhx58["rank_all"])} on all cells to rank {int(dhx58["rank_resid"])} on leftover expression. It is not zonated (Spearman {dhx58_rho:.2f} with `mucosal_pseudospace`).

    **Zonation trio in enterocytes.** Apob rises toward the tip. Nt5e (Cd73) switches on at the extreme tip (mean {nt5e_low:.2f} in the bottom fifth, {nt5e_high:.2f} in the top fifth, Spearman {nt5e_rho:.2f}). Cps1 falls toward the tip (mean {cps1_low:.2f} to {cps1_high:.2f}, Spearman {cps1_rho:.2f}).

    **Il22ra2** is the rare marker the floor is for. It is detected in {il22_n} cells, under {floor} of all cells, so all-cell and leftover scores do not rank it. It is detected in {il22_ent_n} pooled enterocytes, under {floor} of those cells, so the within-enterocyte score does not rank it either. All-cell I is {il22_i_all:.2f}. Leftover I, after own type and spatial domain, is {il22_i_resid:.2f}.
    ///

    /// warning | Caveat
    Moran's I sees one scale, set by 6 neighbors, and rare cell types give small, noisy subsets. When you need a proper statistical test, use a dedicated method like nnSVG or SPARK.
    ///

    [![Open in molab](https://marimo.io/molab-shield.svg)](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_svg.py)
    """)
    return


@app.cell
def landmark_map(adata, ml, mo, n_domains):
    shown = adata.copy()
    shown.obs = shown.obs[["cell_type", "spatial domain"]].copy()
    if int(shown.obs["spatial domain"].nunique()) != int(n_domains):
        raise RuntimeError("spatial domain column does not match the analysis")
    w = mo.ui.anywidget(ml.peek(shown, color="cell_type"))
    w
    return (w,)


@app.cell
def result(MIN_DETECT, adata, mo, np, plt, scores, w):
    color = str(w.color)
    gene = color if color in set(scores["gene"]) else None
    named = color if color in set(map(str, adata.var_names)) else None
    selections = list(w.selections or [])
    focused = str(w.selected_kind) == "type"
    focus_names = list(w.get_obs_names("focus")) if focused else []
    keep_selected = None
    if focus_names:
        selected = adata[focus_names]
        keep_selected = np.asarray((selected.X > 0).mean(axis=0)).ravel() >= MIN_DETECT

    def _values(names):
        sub = adata[list(names)]
        if named is None or sub.n_obs == 0 or named not in sub.var_names:
            return sub, np.asarray([], dtype=float)
        raw = sub[:, named].X
        expr = np.asarray(raw.toarray() if hasattr(raw, "toarray") else raw).ravel()
        return sub, expr

    def _detected(expr):
        return expr.size > 0 and float(np.nanmax(expr)) > 0

    def _scatter():
        finite = scores.replace([np.inf, -np.inf], np.nan).dropna(subset=["I_all", "I_resid"])
        fig, ax = plt.subplots(figsize=(6.2, 4.4))
        ax.scatter(finite["I_all"], finite["I_resid"], s=8, c="0.75", linewidths=0)
        row = finite.loc[finite["gene"] == gene].iloc[0]
        ax.scatter([row["I_all"]], [row["I_resid"]], s=36, c="C0", zorder=3)
        ax.annotate(gene, (row["I_all"], row["I_resid"]), textcoords="offset points", xytext=(6, 6))
        ax.set_xlabel("I_all")
        ax.set_ylabel("I_resid")
        ax.set_title(f"{gene}: all cells vs leftover")
        fig.tight_layout()
        return fig

    def _panels(groups):
        shown = [(label, xy, expr) for label, xy, expr in groups if _detected(expr)]
        if not shown:
            return None
        vmin = min(float(np.min(expr)) for _, _, expr in shown)
        vmax = max(float(np.max(expr)) for _, _, expr in shown)
        if vmin == vmax:
            vmax = vmin + 1.0
        fig, axes = plt.subplots(
            1,
            len(shown),
            figsize=(3.4 * len(shown), 3.6),
            squeeze=False,
            sharex=True,
            sharey=True,
            layout="constrained",
        )
        last = None
        for ax, (label, xy, expr) in zip(axes[0], shown):
            last = ax.scatter(xy[:, 0], xy[:, 1], c=expr, s=8, cmap="viridis", vmin=vmin, vmax=vmax, linewidths=0)
            ax.set_aspect("equal")
            ax.set_title(f"{label}\nn={expr.size}")
        fig.colorbar(last, ax=axes[0].tolist(), label=named, shrink=0.8)
        return fig

    blocks = []
    if gene is not None:
        blocks.append(_scatter())
    elif named is not None:
        blocks.append(mo.md(f"{named} is detected in under {MIN_DETECT:.0%} of all cells, so it is not on the all-cell or leftover scatter."))
    below_selection = False
    if named is not None and keep_selected is not None:
        below_selection = not bool(keep_selected[list(adata.var_names).index(named)])

    groups = []
    quiet = []
    if below_selection:
        blocks.append(mo.md(f"{named} is detected in under {MIN_DETECT:.0%} of the selected cells, so the within-type panel is omitted."))
    elif named is not None and selections:
        focus = set(focus_names) if focused else None
        for sel in selections:
            sel_id = str(sel["id"])
            label = str(sel.get("name") or sel_id)
            names = list(w.get_obs_names(sel_id))
            if focus is not None:
                names = [name for name in names if name in focus]
            sub, expr = _values(names)
            xy = np.asarray(sub.obsm["spatial"]) if sub.n_obs else np.empty((0, 2))
            if _detected(expr):
                groups.append((label, xy, expr))
            else:
                quiet.append(label)
    elif named is not None and focused:
        sub, expr = _values(focus_names)
        xy = np.asarray(sub.obsm["spatial"]) if sub.n_obs else np.empty((0, 2))
        if _detected(expr):
            groups.append(("selected cell type", xy, expr))
        else:
            quiet.append("the selected cell type")

    panel = _panels(groups) if groups else None
    if panel is not None:
        blocks.append(panel)
    for label in quiet:
        blocks.append(mo.md(f"{named} is not detected in {label}, so that panel is omitted."))
    if not blocks:
        blocks.append(mo.md("Select a cell type in the widget, then color a gene. Draw a lasso to compare regions."))
    mo.vstack(blocks) if len(blocks) > 1 else blocks[0]
    return


@app.cell(hide_code=True)
def takeaway(TOP_N, acta2, apob, dhx58, mo, n_drop, top_resid_row):
    mo.md(f"""
    {n_drop} of the top {TOP_N} all-cell genes fall below half their score after own cell type and spatial domain are removed. The highest leftover in that list is {top_resid_row["gene"]} at {top_resid_row["I_resid"]:.2f}. Acta2 falls from {acta2["I_all"]:.2f} to {acta2["I_resid"]:.2f}. Dhx58 moves from rank {int(dhx58["rank_all"])} to rank {int(dhx58["rank_resid"])}. Inside enterocytes, Apob stays patterned at {apob["I_within"]:.2f} and rises toward the villus tip.
    """)
    return


if __name__ == "__main__":
    app.run()
