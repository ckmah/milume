# /// script
# requires-python = ">=3.11,<3.15"
# dependencies = [
#     "marimo>=0.25.1",
#     "marimo-studio==0.4.1",
#     "matplotlib>=3.8",
#     "milume",
#     "numpy",
#     "pandas",
#     "pyarrow>=15",
#     "squidpy>=1.8.2,<1.9"
# ]
# [tool.marimo-studio]
# default = "docs"
# runtimes = ["server", "zero-python"]
#
# [tool.marimo-studio.cells]
# cell-2 = {ref = "cell:v1:34bf30d7c701e58e846cb3e6a3e6ef5d01f3d9b042be0a125354f994603f0129:f0caf9a8dcba3f85135816af4caf0db5fa161bdb3552eea6c45406462610f644:0"}
# cell-6 = {ref = "cell:v1:8942c9fa7e239d23b21e3ac7061199b199b6b1d3bbdcc0d83b7fc532a2730d47:bdd2e4956a518c977abd04ed66cc21412e4b5c3ae60f46a71ec6b23ed3fe2571:0"}
# cell-8 = {ref = "cell:v1:3c0e2e94ae91a1c7dcd5581697c68afaa71b866de093c6b0ab31a5394f4e3103:eccf982ad5d7b79d40432561221ae22ab396674dfbf0ed7b4c38ca751a99e20b:0"}
# cell-9 = {ref = "cell:v1:7e177b5bcfbb97e556307613c264ebb9e483fe30ac024e656d7dc495a3b4f7e8:3adf70f5611c0a6578237d22c95c72911ff23be6df43e3fd274cf70cf74fdd53:0"}
# cell-11 = {ref = "cell:v1:017e424c9c6cbcf9664740368a8cf42338eaefaebbf4bd0cfb9ef12c36761c91:24d1831492d53a1fcd18adda170be0499639f88c075503ef60371af0957070c0:0"}
# cell-12 = {ref = "cell:v1:d272b224ec1d53e7294f918522f8d212b98ae6de2bfb50cb0bb4ac0cef3f6c0d:8ae18855679f6d28706f8f8132b5a8088e2cc066cfe4773d49bcdeff8a2a3afb:0"}
# cell-15 = {ref = "cell:v1:b773405c53c80356a5e7b1ef53886760ab3f6f63dc147af6a0f78de455292327:388e4167ac3b577c705df343e137ca390f0517c6685495a74c749697a162e4b1:0"}
# cell-16 = {ref = "cell:v1:15c21ffed9ea9b2866f6445dca1a9c437c14225712c87857d4c42d21cda44999:d3138d2ebf25cbd00386eba8beee7bfa8a5837655530ec4c553cc46f0e41a0f5:0"}
# cell-19 = {ref = "cell:v1:3383cbe69ad2eff6c3333c73ff28b880ced76e11fcac204349423f453396fe17:770b56eb8f34374130cc0b7f22b2cf5d8a26d714f60eb6361ab6f9f09c4f13f7:0"}
# cell-20 = {ref = "cell:v1:d41f50aa0373f40b024433af8454a27dd75ca98e04d51eee698d7ba7bae30531:5e1a02510c5b9f2742918846df490c1a7ced6849b9c46b5c4f220eb25e7c9fb1:0"}
# cell-erbb3 = {ref = "cell:v1:d6e619798bae0d204182cfcbb2c3a39bb29695b459343d2efe2257e5369e37be:5bcf96bbfb9bf1a3f32b9423527464515538ccdbfe7fdd7bf640e765ca42a902:0"}
# cell-24 = {ref = "cell:v1:9770979b8557bad7829dc6f15441a9a369d6adfb8a9dd3f6074b1e4cc71a5566:187654320bf4950d0cab9add7845875b35eb000b278b0a0936926b442353f1dc:0"}
# cell-tenth = {ref = "cell:v1:2ab4e03ff83c55cd41d48a0c8689dc4f4afc1abd64f02456df498eae856a173d:f74de9407e488ae3c2fa8b5f57a91d4695795b28e21e0120a341d1ebbffbe920:0"}
# cell-25 = {ref = "cell:v1:5613ae7638deee35a6ca49abdd4cdc51fcb015f89cfcb3ee01aad5b155d631b5:01e638f8000b9ef25d23fdaa4dd841b1260a69e3c15fe26422679e7671d2434c:0"}
# cell-depth = {ref = "cell:v1:5581d8a68354be83b4df1e806be9c3a0e0f9baea0f346b4ba836243a44658087:b9721f2814ba90b2ef4bd7c515c2ef0f5030ec8719e84635c7a6bcfc382bde3b:0"}
# cell-26 = {ref = "cell:v1:692f798c0ce2b1f7b3753d50d51488529d662858294b3ac5b16d808442dff23b:dd0e5952b24b03666159297cac39b040600ece05438618e8b20693d2a6e31cae:0"}
# cell-27 = {ref = "cell:v1:46fe492910aedcf069dbe30de204619bbd66fdc7f4189339e56e25f82b91e793:f755a728fae900789e84c7501c866c4e0e934f4f39710ff5abc816245197296f:0"}
# ///
"""Squidpy Moran's I recipe: cell-type layout vs patterns inside enterocytes (ileum)."""

import marimo

__generated_with = "0.25.2"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def intro(mo):
    mo.md(r"""
    # Moran's I: is a gene spatial because of where cell types sit, or within one?

    *By Clarence Mah · Last updated 2026-11-01*

    Many genes look patterned in a tissue section. Some only look that way because the cells that express them sit together. Others change with position inside a single cell type, and those tell us how one cell type divides its work across the tissue.

    We use one MERFISH section of mouse ileum from [Xu et al. 2026](https://doi.org/10.1016/j.chom.2026.01.018): 30,332 cells × 1,815 genes, with the authors' cell types. Here we score every gene with Moran's I across all cells, score again inside enterocytes only, and follow two genes: **Erbb3**, which drops, and **Apob**, which holds.

    [Open in molab](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_moran.py). This page shows a precomputed default view. To change selections or rerun the analysis, open the notebook in molab.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    > **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook. After the server connects, click **Run all** (the ▶ button at the bottom right) to run the notebook.
    """)
    return


@app.cell(hide_code=True)
def assets(mo):
    def asset(relpath):
        """Repo file next to this notebook, or the same file on main (molab opens the notebook alone)."""
        local = mo.notebook_dir().parent.parent / relpath
        return local if local.is_file() else f"https://raw.githubusercontent.com/ckmah/milume/main/{relpath}"
    return (asset,)


@app.cell(hide_code=True)
def schematic(asset, mo):
    mo.vstack([
        mo.image(src=asset("demos/recipes/squidpy_moran_schematic/schematic-moran-statechart.svg"), alt="Method flow: one graph and score on all cells, the same calls on enterocytes only"),
        mo.image(src=asset("demos/recipes/squidpy_moran_schematic/schematic-moran-panels.svg"), alt="Schematic, not data: Erbb3 and Apob before and after fixing the cell type"),
    ])
    return


@app.cell(hide_code=True)
def imports():
    import marimo as mo
    import milume as ml
    import numpy as np
    import matplotlib.pyplot as plt
    import pandas as pd
    import squidpy as sq
    return ml, mo, np, pd, plt, sq


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Load data

    We load the ileum section with milume's dataset loader and add `n_counts`, the transcripts per cell from `layers["raw_counts"]`, so we can check later whether a pattern is just sequencing depth.
    """)
    return


@app.cell
def load_data(ml, mo, np):
    adata = ml.ds.ileum_merfish_xu2026()
    adata.obs["n_counts"] = np.asarray(adata.layers["raw_counts"].sum(axis=1)).ravel()
    mo.show_code(adata)
    return (adata,)


@app.cell(hide_code=True)
def _(adata, mo):
    mo.md(f"""
    Moran's I runs on `X`. It already holds the authors' log-normalized values (non-integer, max {adata.X.max():.1f}), so we don't normalize or log-transform again.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Score every gene across all cells

    **Moran's I** asks whether neighboring cells have more similar expression than random pairs of cells ([Moran 1950](https://doi.org/10.2307/2332142)). Think of a seating chart: if people next to each other wear the same color, the room has a pattern. I is near 0 for a random layout and near 1 when neighbors match.

    We link each cell to its `n_neighs=6` nearest cells, about the ring of cells that touch it. `percentile=99` drops the longest 1% of links, which jump across the lumen or tissue gaps. `n_perms=None` skips the shuffle test: we compare I values, not p-values, and shuffling would add minutes without changing I.
    """)
    return


@app.cell
def moran_all(mo):
    mo.md(r"""
```python
sq.gr.spatial_neighbors_knn(adata, n_neighs=6, percentile=99)
moran_all_cells = sq.gr.spatial_autocorr(adata, mode="moran", n_perms=None, copy=True)
```
    """)
    return


@app.cell
def moran_all_compute(adata, sq):
    sq.gr.spatial_neighbors_knn(adata, n_neighs=6, percentile=99)
    moran_all_cells = sq.gr.spatial_autocorr(adata, mode="moran", n_perms=None, copy=True)
    return (moran_all_cells,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    /// tip | Choosing the neighbor graph
    Moran's I depends on who counts as a neighbor. A small `n_neighs` asks about the cells right next door; a large one smooths over whole villi. Six nearest cells is a common default for imaging data. Don't use an unpruned Delaunay graph here: its longest links span about 1 mm. The [niches recipe](../squidpy_color/) shows how graph size changes a result.
    ///

    /// note | Precomputed
    This page shows one saved run of these calls. Without the shuffle test, scoring every gene takes seconds, so open the notebook in molab to rerun it with your own settings.
    ///
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Score again inside enterocytes

    A high all-cell score can come from the layout of cell types alone: epithelium on the inside, muscle on the outside. To ask what varies *within* one cell type, we keep only enterocytes, the absorptive cells that line the villi, and rebuild the graph so each enterocyte's neighbors are other enterocytes. We score genes detected in at least 5% of enterocytes; rarer genes give unstable scores. This is the same idea as the cell-type-specific spatially variable genes in [Yan, Hua & Li 2025](https://doi.org/10.1038/s41467-025-56080-w), done with one subset.
    """)
    return


@app.cell
def subset(adata, mo, np):
    ent = adata[adata.obs.cell_type.str.startswith("Enterocyte")].copy()
    detected = np.asarray((ent.X > 0).sum(axis=0)).ravel() / ent.n_obs
    genes = list(ent.var_names[detected >= 0.05])
    mo.show_code()
    return ent, genes


@app.cell
def moran_ent(mo):
    mo.md(r"""
```python
sq.gr.spatial_neighbors_knn(ent, n_neighs=6, percentile=99)
moran_enterocytes = sq.gr.spatial_autocorr(ent, genes=genes, mode="moran", n_perms=None, copy=True)
scores = pd.DataFrame({"moran_I_all": moran_all_cells["I"], "moran_I_enterocyte": moran_enterocytes["I"]})
```
    """)
    return


@app.cell
def moran_ent_compute(ent, genes, moran_all_cells, pd, sq):
    sq.gr.spatial_neighbors_knn(ent, n_neighs=6, percentile=99)
    moran_enterocytes = sq.gr.spatial_autocorr(ent, genes=genes, mode="moran", n_perms=None, copy=True)
    scores = pd.DataFrame({"moran_I_all": moran_all_cells["I"], "moran_I_enterocyte": moran_enterocytes["I"]})
    return (scores,)


@app.cell(hide_code=True)
def _(ent, genes, mo):
    mo.md(f"""
    The subset holds {ent.n_obs:,} enterocytes, and {len(genes)} genes pass the 5% rule.

    /// tip | Choosing the subset
    `str.startswith("Enterocyte")` keeps all four enterocyte labels. The authors named three of them by villus position (bottom, mid, top), so pooling them keeps the villus gradient we want to see. Run on one label to remove that gradient instead (see the caveat below).
    ///
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Explore Erbb3 and Apob in the tissue

    The map opens colored by **Erbb3**. It lights up the epithelium that lines every villus and stays dark in the muscle and immune tissue around it. To keep this page small, its map holds only a 400 µm wide strip across the middle of the section; in molab the map holds the whole section.
    """)
    return


@app.cell(hide_code=True)
def map_view(adata, np):
    import os

    _xy = adata.obsm["spatial"]
    _mucosa = adata.obs["anatomical_layer"].eq("Mucosa").to_numpy()
    _x_mid = float(np.median(_xy[_mucosa, 0]))
    _strip = (_xy[:, 0] >= _x_mid - 200) & (_xy[:, 0] <= _x_mid + 200)
    _export_strip = os.environ.get("MILUME_RECIPE_EXPORT_STRIP") == "1"
    adata_map = (adata[_strip] if _export_strip else adata).copy()
    adata_map.obs = adata_map.obs[["cell_type", "n_counts"]].copy()
    return (adata_map,)


@app.cell
def landmark_map(adata_map, ml, mo):
    w = mo.ui.anywidget(ml.peek(adata_map, color="Erbb3"))
    w
    return (w,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    Erbb3 is bright along the whole length of each villus, from crypt to tip. Now switch the color to **Apob**. It is dim near the crypts and bright toward the villus tips.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Erbb3 drops inside enterocytes; Apob holds

    To place each enterocyte between villus base and tip, we use the crypt as the landmark. Stem and Paneth cells sit at the crypt base, so an enterocyte's villus position is its straight-line distance to the nearest stem or Paneth cell: small near the base, large near the tip. We find that nearest cell with a k-d tree from scipy.

    The left panel compares each gene's two scores. The right panel splits enterocytes into ten equal-size groups by that distance and shows each group's mean expression. The gene you pick in the map is added in black. In molab, lasso one villus to profile only its enterocytes.
    """)
    return


@app.cell(hide_code=True)
def plot_helpers(pd, plt):
    HIGHLIGHT = {"Erbb3": "#4E79A7", "Apob": "#E15759"}
    PICKED = "#1F2328"
    def villus_profile(cells, dist, genes, n_bins: int = 10) -> pd.DataFrame:
        """Mean expression of `genes` in n_bins equal-count bins of distance to the crypt (1 = nearest)."""
        pos = pd.qcut(dist[cells.obs_names], n_bins, labels=range(1, n_bins + 1))
        return cells[:, list(genes)].to_df().groupby(pos.to_numpy(), observed=True).mean()


    def plot_moran_contrast(scores, cells, dist, gene: str):
        """Left: all-cell vs within-enterocyte Moran's I. Right: expression along the villus."""
        scores = scores.dropna()
        genes = dict(HIGHLIGHT)
        if gene not in genes and gene in cells.var_names:
            genes[gene] = PICKED
        fig, (ax, bx) = plt.subplots(1, 2, figsize=(10, 4.2), layout="constrained")
        ax.scatter(scores["moran_I_all"], scores["moran_I_enterocyte"], s=8, c="0.78", linewidths=0)
        hi = float(scores.to_numpy().max())
        ax.plot([0, hi], [0, hi], color="0.6", linewidth=0.8)
        for name, color in genes.items():
            if name in scores.index:
                x, y = scores.loc[name]
                ax.scatter([x], [y], s=40, c=color, zorder=3)
                ax.annotate(name, (x, y), xytext=(6, 4), textcoords="offset points")
        ax.set_xlabel("Moran's I, all cells")
        ax.set_ylabel("Moran's I, enterocytes only")
        profile = villus_profile(cells, dist, genes)
        for name, color in genes.items():
            bx.plot(profile.index, profile[name], "-o", color=color, label=name, markersize=4)
        bx.set_xlabel("Distance to nearest stem or Paneth cell, tenths (1 = nearest)")
        bx.set_ylabel("Mean expression in enterocytes (log)")
        bx.legend(frameon=False)
        return fig
    return (plot_moran_contrast,)


@app.cell
def villus(adata, ent, mo, pd):
    from scipy.spatial import KDTree

    crypt = adata.obs["cell_type"].isin(["Stem", "Paneth"]).to_numpy()
    dist, _ = KDTree(adata.obsm["spatial"][crypt]).query(ent.obsm["spatial"])
    dist = pd.Series(dist, index=ent.obs_names)  # µm to the nearest stem or Paneth cell
    rho = {g: ent[:, g].to_df()[g].corr(dist, method="spearman") for g in ("Erbb3", "Apob")}
    mo.show_code()
    return dist, rho


@app.cell
def result_figure(adata, dist, ent, plot_moran_contrast, scores, w):
    gene = w.color if w.color in adata.var_names else "Erbb3"
    picked = [s["id"] for s in w.selections]
    cells = ent.obs_names.intersection(w.get_obs_names(picked[0])) if picked else ent.obs_names
    plot_moran_contrast(scores, ent[cells], dist, gene)
    return


@app.cell(hide_code=True)
def _(ent, mo, scores):
    _erbb3 = scores.loc["Erbb3"]
    _frac = float((ent[:, "Erbb3"].X > 0).mean())
    mo.md(f"""
    **Erbb3** scores {_erbb3.moran_I_all:.2f} across all cells but only {_erbb3.moran_I_enterocyte:.2f} inside enterocytes, even though {_frac:.0%} of enterocytes express it. Its all-cell score comes from where epithelium sits relative to the gut wall, not from position along the villus.
    """)
    return


@app.cell(hide_code=True)
def _(mo, rho, scores):
    _apob = scores.loc["Apob"]
    mo.md(f"""
    **Apob** scores {_apob.moran_I_all:.2f} across all cells and still {_apob.moran_I_enterocyte:.2f} inside enterocytes. Its expression rises with distance from the crypt (Spearman ρ = {rho["Apob"]:.2f}), so neighboring enterocytes match because they sit at the same height on the villus.
    """)
    return


@app.cell(hide_code=True)
def _(dist, ent, mo, pd, rho):
    _tenth = pd.qcut(dist, 10, labels=False)
    _apob_on = ent[:, "Apob"].to_df()["Apob"] > 0
    mo.md(f"""
    In the tenth of enterocytes nearest a crypt, {_apob_on[_tenth == 0].mean():.0%} express Apob; in the farthest tenth, {_apob_on[_tenth == 9].mean():.0%} do. Erbb3 changes little along the same axis (ρ = {rho["Erbb3"]:.2f}), apart from a rise in the farthest tenth.
    """)
    return


@app.cell(hide_code=True)
def _(mo, scores):
    _top_all = scores["moran_I_all"].nlargest(20).index
    _top_ent = scores["moran_I_enterocyte"].nlargest(20).index
    mo.md(f"""
    The two top-20 lists share only {len(_top_all.intersection(_top_ent))} genes. Many of the all-cell leaders, like smooth muscle **Acta2**, rank high because of tissue layout.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Is the Apob gradient just sequencing depth?

    Cells farther from the crypt could simply have more transcripts detected, which would lift every gene. We rank Apob, distance and `n_counts`, remove the straight-line effect of `n_counts` from the other two ranks, and correlate what is left (a partial Spearman correlation).
    """)
    return


@app.cell
def depth_check(dist, ent, mo, np, pd):
    ranks = pd.DataFrame({"apob": ent[:, "Apob"].to_df()["Apob"], "dist": dist, "depth": ent.obs["n_counts"]}).rank()
    def remove_depth(col):
        return ranks[col] - np.polyval(np.polyfit(ranks["depth"], ranks[col], 1), ranks["depth"])
    rho_depth = ranks["depth"].corr(ranks["dist"])
    partial_rho = np.corrcoef(remove_depth("apob"), remove_depth("dist"))[0, 1]
    mo.show_code()
    return partial_rho, rho_depth


@app.cell(hide_code=True)
def _(mo, partial_rho, rho_depth):
    mo.md(f"""
    Depth does rise away from the crypt (ρ = {rho_depth:.2f}), but with depth held fixed Apob still tracks distance (partial ρ = {partial_rho:.2f}). The gradient is not a depth artifact.

    /// note | Caveat: a 2D proxy and position-named subtypes
    Straight-line distance in a 2D section is only a proxy for villus position. A villus cut at an angle looks shorter than it is, and a crypt just outside the section makes nearby enterocytes look farther from the base. Three of the four enterocyte labels are named by villus position, so pooling them keeps the gradient on purpose; for a stricter check in molab, rerun the enterocyte calls on one label, `ent[ent.obs.cell_type == "Enterocyte (mid)"]`. This file has one point per cell, so it can't show where Apob mRNA sits inside a cell.
    ///
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Takeaway

    - An all-cell Moran's I ranking mixes two things: where cell types sit, and how expression changes inside a cell type.
    - Scoring again inside one cell type separates them. **Erbb3** is spatial only because epithelium sits in one place. **Apob** stays spatial inside enterocytes because it rises with distance from the crypt, toward the villus tip.
    - The Apob gradient matches [Moor et al. 2018](https://doi.org/10.1016/j.cell.2018.08.063), who found the chylomicron-assembly genes, including Apob, highest in enterocytes at the villus tips. They measured mouse jejunum, not ileum; [Xu et al. 2026](https://doi.org/10.1016/j.chom.2026.01.018) cite the study for gene expression changing from crypt to villus tip.

    ## Try it

    - Switch between **Erbb3** and **Apob** and watch the right panel. Which line climbs?
    - Color by **Cps1**. Its high enterocytes sit near the crypts, the mirror image of Apob. Where does it land in the scatter?
    - Color by `n_counts`. Compare it with Apob along a few villi.
    - Lasso a single villus (molab only). Does the Apob profile still climb with distance from the crypt in one villus?
    - Color by **Acta2**. It tops the all-cell ranking but isn't scored in enterocytes. Why?

    ## Next

    - [Squidpy niches](../squidpy_color/): how the size of the neighbor graph changes which niches you find.
    """)
    return


if __name__ == "__main__":
    app.run()
