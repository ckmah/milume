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
    3. Lasso a gut-associated lymphoid (GALT) follicle and enrich immune types in the selection.
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
        Draw a **lasso** around the large GALT follicle on the map (Select tool). The next
        cell replays a fixed polygon for headless runs; in molab, your own lasso replaces it
        when you re-run after drawing.
        """
    )
    return


@app.cell
def _(w):
    # Convex hull of the main GALT follicle (`anatomical_layer == "GALT"`, larger cluster).
    w.selections = [
        {
            "id": "galt-follicle",
            "type": "polygon",
            "vertices": [
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
            ],
        }
    ]
    w.color = "cell_type"
    return


@app.cell
def _(adata, ml, w):
    galt_hits = w.get_obs_names("galt-follicle")
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
