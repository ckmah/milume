# /// script
# requires-python = ">=3.11,<3.15"
# dependencies = [
#     "marimo>=0.25.1",
#     "marimo-studio==0.4.1",
#     "milume",
#     "scanpy>=1.10"
# ]
# [tool.marimo-studio]
# default = "docs"
# runtimes = ["server", "zero-python"]
#
# [tool.marimo-studio.cells]
# cell-1 = {ref = "cell:v1:d4d12ebc8e5d3bd3fb406db27a3fb2e81116bd0a5aef8e8bde5593088af11238:fa0aafe1b48aa17327f5f7869f070c67cc0cb66e60f01641eeace54579c3d676:0"}
# ///
"""CI payload probe: ileum peek with all genes preloaded (not a published docs recipe)."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        # Ileum all-genes payload probe

        Internal marimo-studio export for ``check_recipe_payload.py`` (#408). Not linked
        from the docs nav; validates gzip CSC widget state under the 10 MiB data budget.
        """
    )
    return


@app.cell
def _():
    import importlib.util
    import marimo as mo
    from pathlib import Path

    import milume

    _helpers_path = Path(__file__).resolve().parent / "squidpy_color_helpers.py"
    _spec = importlib.util.spec_from_file_location("_squidpy_color_helpers", _helpers_path)
    _helpers = importlib.util.module_from_spec(_spec)
    assert _spec.loader is not None
    _spec.loader.exec_module(_helpers)
    docs_recipe_adata = _helpers.docs_recipe_adata

    return docs_recipe_adata, milume, mo


@app.cell
def _(docs_recipe_adata):
    adata = docs_recipe_adata()
    return (adata,)


@app.cell
def landmark_map(adata, milume):
    w = milume.peek(adata, color="cell_type", genes=list(adata.var_names))
    w
    return (w,)


if __name__ == "__main__":
    app.run()
