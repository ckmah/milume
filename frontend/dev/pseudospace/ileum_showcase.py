# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "anndata>=0.10",
#     "matplotlib>=3.8",
#     "numpy>=1.26",
#     "scipy>=1.11",
# ]
# ///
"""Prototype marimo notebook for issue 471. It does not ship, and it adds no public API.

``python ileum_compute.py`` writes the same figure without marimo.
"""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell
def _():
    from ileum_compute import run

    result = run()
    result
    return (result,)


@app.cell
def _(result):
    import marimo as mo

    mo.md(
        f"""
        Spearman rho of kNN pseudospace against `mucosal_pseudospace`.

        Mucosa cells **{result['rho_mucosa']:.3f}**. All cells **{result['rho_all']:.3f}**.

        A single crypt line and villus line across the section does not follow the folded
        mucosa (`rho` {result['rho_lines']:.3f}). The pair that does is the Paneth population
        as the crypt base and enterocyte (top) as the villus tip. The figure is `{result['plot']}`.
        """
    )
    return


if __name__ == "__main__":
    app.run()
