import marimo

app = marimo.App(width="full")


@app.cell
def _():
    import anndata as ad
    import marimo as mo
    import numpy as np
    import pandas as pd

    import milume

    rng = np.random.default_rng(0)
    n = 4000
    xy = rng.uniform(0, 1000, size=(n, 2))
    kinds = np.array(["Epithelial", "Immune", "Stromal", "Endothelial"])
    cell_type = kinds[np.clip((xy[:, 0] // 250).astype(int), 0, 3)]
    adata = ad.AnnData(
        X=np.zeros((n, 1), dtype=np.float32),
        obs=pd.DataFrame({"cell_type": pd.Categorical(cell_type)}, index=[f"c{i}" for i in range(n)]),
        var=pd.DataFrame(index=["g0"]),
    )
    adata.obsm["spatial"] = xy
    w = milume.peek(adata, color="cell_type")
    w.selections = [{"id": "selection 1", "name": "selection 1", "type": "rectangle", "cx": 400.0, "cy": 500.0, "width": 300.0, "height": 300.0, "angle": 0.0}]
    w.selected_kind = "selection"
    w.selected_index = 0
    hits = w.get_obs_names("selection 1")
    focus = w.get_obs_names("focus")
    adata.obs["in_sel"] = adata.obs_names.isin(hits)
    try:
        w.get_obs_names("nope")
        err = "no error"
    except KeyError as e:
        err = f"KeyError: {e}"
    report = mo.md(
        f"""
    `w.get_obs_names("selection 1")` → `{type(hits).__name__}` of **{len(hits)}** cells (first: `{list(hits[:3])}`)

    `w.get_obs_names("focus")` → **{len(focus)}** cells, equal: **{hits.equals(focus)}**

    `adata.obs["in_sel"].sum()` → **{int(adata.obs["in_sel"].sum())}**

    `w.get_obs_names("nope")` → `{err}`
    """
    )
    mo.vstack([report, w])
    return


if __name__ == "__main__":
    app.run()
