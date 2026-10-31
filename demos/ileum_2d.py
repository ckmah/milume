# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo>=0.25.1",
#     "marimo-lens",
#     "matplotlib>=3.8",
#     "milume==2.1.0",
#     "scanpy>=1.10",
# ]
# ///

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    > **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook. After the server connects, click **Run all** (the ▶ button at the bottom right) to run the notebook.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        > **molab:** Cells do not run on load ([#361](https://github.com/ckmah/milume/issues/361)). Click **Run all** (or run cells top to bottom) before using the map.
        """
    )
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Explore cells in 2D (ileum)

    MERFISH cross-section from Xu et al. 2026 ([`ileum.h5ad`](https://github.com/ckmah/milume/blob/main/demos/data/ileum.h5ad),
    CC0-1.0 on Dryad). **Open in molab:**
    [ileum_2d.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/ileum_2d.py)

    1. Fetch the slice and open the map on `cell_type`.
    2. Recolour by layer and villus–crypt genes.
    3. Lasso the GALT cryptopatch aggregates and enrich immune and stromal types in the selection.
    """)
    return


@app.cell
def _():
    import marimo as mo
    import scanpy as sc

    import milume as ml

    return ml, mo, sc


@app.cell
def _(ml):
    adata = ml.ds.ileum_merfish_xu2026()
    adata
    return (adata,)


@app.cell
def _(adata, ml, mo):
    # Curated preload for marimo export payload; full catalog loads on demand.
    demo_genes = [
        "Apob",
        "Slc5a1",
        "Nos2",
        "Cps1",
        "Mki67",
        "Lgr5",
        "Erbb3",
        "H2-Eb1",
        "Acta2",
        "Col1a1",
        "Phox2b",
        "Kit",
        "Pecam1",
        "Mzb1",
        "Cd3e",
        "Csf1r",
        "Cxcl13",
        "Cr2",
        "Ccr7",
    ]
    w = mo.ui.anywidget(ml.peek(adata, color="cell_type", genes=demo_genes))
    return (w,)


@app.cell
def _(mo, w):
    mo.vstack([mo.md("Whole ileum ring, coloured by **cell_type**."), w])
    return


@app.cell
def _(mo, w):
    w.color = "anatomical_layer"
    mo.vstack([mo.md("**anatomical_layer** — mucosa, submucosa, muscle, and GALT."), w])
    return


@app.cell
def _(mo, w):
    w.color = "Apob"
    mo.vstack([mo.md("**Apob** — villus-tip enterocytes."), w])
    return


@app.cell
def _(mo, w):
    w.color = "Cps1"
    mo.vstack([mo.md("**Cps1** — crypt and lower-villus enterocytes."), w])
    return


@app.cell
def _(mo, w):
    mo.md(
        r"""
        Draw **lassos** around each GALT cryptopatch aggregate on the map (Select tool). The next
        cell replays fixed polygons for headless runs; in molab, your own lassos replace them
        when you re-run after drawing.
        """
    )
    return


@app.cell
def _(w):
    # Tight hulls per annotated GALT aggregate (`anatomical_layer == "GALT"`), western + eastern.
    w.selections = [
        {
            "id": "galt-aggregates-west",
            "type": "polygon",
            "vertices": [
                [-3993.47, 1335.52],
                [-4013.97, 1290.09],
                [-4012.76, 1279.44],
                [-4010.43, 1272.69],
                [-3989.78, 1252.28],
                [-3976.41, 1245.56],
                [-3969.86, 1246.31],
                [-3943.89, 1255.36],
                [-3904.92, 1269.77],
                [-3897.35, 1283.63],
                [-3889.0, 1319.68],
                [-3893.11, 1330.49],
                [-3926.37, 1347.29],
                [-3950.65, 1357.98],
                [-3977.63, 1344.92],
            ],
        },
        {
            "id": "galt-aggregates-east",
            "type": "polygon",
            "vertices": [
                [-3057.83, 1698.77],
                [-3203.83, 1753.98],
                [-3054.59, 1715.1],
                [-3038.34, 1730.95],
                [-3027.98, 1747.03],
                [-2993.24, 1750.69],
                [-2983.99, 1747.98],
                [-2964.16, 1723.35],
                [-2961.4, 1715.74],
                [-2969.14, 1697.16],
                [-3000.04, 1679.67],
                [-3034.12, 1667.94],
                [-3039.64, 1668.04],
                [-3055.85, 1676.73],
                [-3058.78, 1691.55],
                [-3057.83, 1698.77],
            ],
        },
    ]
    w.color = "cell_type"
    return


@app.cell
def _(adata, ml, w):
    galt_hits = w.get_obs_names("galt-aggregates-west").union(w.get_obs_names("galt-aggregates-east"))
    enrich = ml.enrichment(adata, galt_hits, obs_key="cell_type")
    enrich
    return enrich, galt_hits


@app.cell
def _(adata, galt_hits, sc):
    import matplotlib.pyplot as plt

    adata.obs["galt_vs_rest"] = "rest"
    adata.obs.loc[galt_hits, "galt_vs_rest"] = "GALT selection"
    adata.obs["galt_vs_rest"] = adata.obs["galt_vs_rest"].astype("category")
    sc.pl.violin(
        adata,
        ["Mzb1", "Cd3e"],
        groupby="galt_vs_rest",
        show=False,
    )
    plt.gcf()
    return


if __name__ == "__main__":
    app.run()
