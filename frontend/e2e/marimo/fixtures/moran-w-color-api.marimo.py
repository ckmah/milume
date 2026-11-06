# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo>=0.25.1",
#     "matplotlib>=3.8",
#     "milume @ file:///workspace",
#     "numpy>=1.26",
#     "pandas>=2.1",
# ]
# ///

"""Marimo API e2e: result_figure re-runs when the Landmarks color gene changes (w.color)."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import matplotlib.pyplot as plt
    import milume as ml
    import numpy as np
    import pandas as pd
    from anndata import AnnData

    n = 80
    rng = np.random.default_rng(0)
    adata = AnnData(
        X=rng.random((n, 4)),
        obs={"cell_type": np.array(["A", "B"] * (n // 2), dtype=object)},
        var=pd.DataFrame(index=["Apob", "Erbb3", "Acta2", "Slc5a1"]),
    )
    adata.obsm["spatial"] = rng.random((n, 2)) * 100
    adata.var["moran_I_all"] = [0.63, 0.47, 0.74, 0.55]
    adata.var["moran_I_enterocyte"] = [0.52, 0.10, np.nan, 0.48]
    return adata, ml, mo, np, pd, plt


@app.cell
def landmark_map(adata, ml, mo):
    w = mo.ui.anywidget(ml.peek(adata, color="Erbb3", genes=None))
    w.color = "Erbb3"
    return (w,)


@app.cell
def _(w):
    w
    return


@app.cell
def result_figure(adata, mo, np, pd, plt, w):
    _ = w.value
    active = list(w.active_genes or [])
    gene_name = str(active[-1]) if active else str(w.color or "Erbb3")
    moran_scores = adata.var[["moran_I_all", "moran_I_enterocyte"]]
    both = moran_scores.dropna(subset=["moran_I_all", "moran_I_enterocyte"])
    fig, ax = plt.subplots(figsize=(4, 3), layout="constrained")
    ax.scatter(both["moran_I_all"], both["moran_I_enterocyte"], s=12, c="0.75")
    if gene_name in both.index:
        row = both.loc[gene_name]
        ax.scatter([row["moran_I_all"]], [row["moran_I_enterocyte"]], s=48, c="#d62728", zorder=3)
        ax.annotate(gene_name, (float(row["moran_I_all"]), float(row["moran_I_enterocyte"])))
    ax.set_title("All cells vs enterocytes")
    mo.vstack([fig, mo.md(f"moran-w-color-probe gene={gene_name}")])
    return


if __name__ == "__main__":
    app.run()
