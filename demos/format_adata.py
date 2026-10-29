# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "anndata",
#     "marimo>=0.25.1",
#     "milume==2.0.0",
# ]
# ///

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    > **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Validate ileum AnnData

    Loads the committed `demos/data/ileum.h5ad` and checks layout, gene panel, and md5.
    """)
    return


@app.cell
def _():
    EXPECTED_GENES = (
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
    )
    EXPECTED_MD5 = "dbb646e8304a7a9b69603992ed8974fe"
    import hashlib
    from pathlib import Path

    import anndata as ad
    import marimo as mo
    from milume import LandmarksWidget

    DATA = Path(__file__).resolve().parent / "data" / "ileum.h5ad"
    return (
        DATA,
        EXPECTED_GENES,
        EXPECTED_MD5,
        LandmarksWidget,
        ad,
        hashlib,
        mo,
    )


@app.cell
def _(DATA, EXPECTED_MD5, ad, hashlib):
    digest = hashlib.md5(DATA.read_bytes()).hexdigest()
    assert digest == EXPECTED_MD5, f"md5 mismatch: {digest}"
    adata = ad.read_h5ad(DATA)
    return adata, digest


@app.cell
def _(EXPECTED_GENES, adata):
    obs_cols = {"cell_type", "cell_class", "anatomical_layer", "mucosal_pseudospace"}
    assert obs_cols <= set(adata.obs.columns)
    assert list(adata.obsm) == ["spatial"]
    assert adata.obsm["spatial"].dtype.kind == "f"
    assert str(adata.X.dtype) == "float32"
    assert tuple(map(str, adata.var_names)) == EXPECTED_GENES
    assert "cell_type_colors" in adata.uns
    {
        "n_obs": int(adata.n_obs),
        "n_vars": int(adata.n_vars),
        "genes": list(map(str, adata.var_names)),
    }


@app.cell
def _(LandmarksWidget, adata):
    widget = LandmarksWidget(adata, color="cell_type", genes=list(adata.var_names))
    {
        "categories": len(widget.legend_labels or []),
        "genes": len(widget.gene_names or []),
        "x_bounds": widget.x_bounds,
        "y_bounds": widget.y_bounds,
    }


if __name__ == "__main__":
    app.run()
