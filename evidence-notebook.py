import marimo

app = marimo.App(width="full")


@app.cell
def _():
    import os

    import anndata as ad
    import numpy as np
    import pandas as pd

    import milume

    rng = np.random.default_rng(0)
    n = 4000
    xy = rng.uniform(0, 1000, size=(n, 2))
    kinds = np.array(["Epithelial", "Immune", "Stromal", "Endothelial"])
    band = np.clip((xy[:, 0] // 250).astype(int), 0, 3)
    cell_type = kinds[band]
    apob = np.exp(-((xy[:, 0] - 700) ** 2 + (xy[:, 1] - 400) ** 2) / 2e4) * 8
    X = np.column_stack([apob, rng.poisson(1, n)]).astype(np.float32)
    adata = ad.AnnData(
        X=X,
        obs=pd.DataFrame({"cell_type": pd.Categorical(cell_type)}, index=[f"c{i}" for i in range(n)]),
        var=pd.DataFrame(index=["APOB", "LGR5"]),
    )
    adata.obsm["spatial"] = xy
    adata.obs["region"] = np.where(xy[:, 1] > 500, "crypt", "lumen")
    adata.obs["distance"] = np.hypot(xy[:, 0] - 500, xy[:, 1] - 500)
    w = milume.peek(adata)
    key = os.environ.get("MILUME_COLOR", "")
    if key:
        w.color = key
    w
    return


if __name__ == "__main__":
    app.run()
