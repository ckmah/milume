"""Moran's I recipe data rules: n_counts, detected genes, and the score table."""

from __future__ import annotations

import ast
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pytest

from tests.helpers import adata_xy
from tests.squidpy_moran_recipes import (
    ENTEROCYTE_MIN_FRACTION,
    ILEUM_H5AD,
    MORAN_COLUMNS,
    attach_n_counts,
    docs_recipe_adata,
    genes_detected_in_at_least,
    mean_expression_by_cell_type,
    read_moran_scores,
)


def test_attach_n_counts_sums_raw_counts_and_leaves_an_existing_column():
    adata = adata_xy(
        [0.0, 1.0],
        [0.0, 1.0],
        genes={"Apob": [1.0, 2.0], "Acta2": [0.0, 1.0]},
    )
    adata.layers["raw_counts"] = np.array([[3, 1], [0, 4]], dtype=np.int32)
    attach_n_counts(adata)
    np.testing.assert_array_equal(adata.obs["n_counts"].to_numpy(), [4, 4])
    adata.obs["n_counts"] = [9, 9]
    attach_n_counts(adata)
    np.testing.assert_array_equal(adata.obs["n_counts"].to_numpy(), [9, 9])


def test_attach_n_counts_rejects_a_matrix_with_no_total():
    adata = adata_xy([0.0], [0.0], genes={"Apob": [1.0]})
    with pytest.raises(KeyError, match="raw_counts"):
        attach_n_counts(adata)


def test_genes_detected_in_at_least_keeps_the_five_percent_boundary():
    n = 20
    detected = [1.0] + [0.0] * (n - 1)
    silent = [0.0] * n
    adata = adata_xy(
        list(range(n)),
        list(range(n)),
        color=["Enterocyte (top)"] * n,
        color_key="cell_type",
        genes={"Apob": detected, "Silent": silent},
    )
    assert genes_detected_in_at_least(adata, ENTEROCYTE_MIN_FRACTION) == ["Apob"]


def test_read_moran_scores_requires_both_columns(tmp_path):
    missing = tmp_path / "absent.parquet"
    assert read_moran_scores(missing) is None

    path = tmp_path / "scores.parquet"
    pd.DataFrame({"moran_I_all": [0.2, 0.8]}, index=["Acta2", "Apob"]).to_parquet(path)
    assert read_moran_scores(path) is None

    pd.DataFrame(
        {"moran_I_all": [0.2, 0.8], "moran_I_enterocyte": [0.01, 0.7]},
        index=["Acta2", "Apob"],
    ).to_parquet(path)
    scores = read_moran_scores(path)
    assert scores is not None
    assert list(scores.columns) == list(MORAN_COLUMNS)
    assert scores.index.tolist() == ["Acta2", "Apob"]
    assert scores.loc["Apob", "moran_I_enterocyte"] == pytest.approx(0.7)


def test_mean_expression_orders_cell_types_low_to_high():
    adata = adata_xy(
        [0, 1, 2, 3],
        [0, 0, 1, 1],
        color=["Enterocyte (top)", "Enterocyte (top)", "Fibroblast", "Fibroblast"],
        color_key="cell_type",
        genes={"Apob": [4.0, 2.0, 0.0, 0.0]},
    )
    means = mean_expression_by_cell_type(adata, "Apob")
    assert means.index.tolist() == ["Fibroblast", "Enterocyte (top)"]
    assert means.tolist() == pytest.approx([0.0, 3.0])


@pytest.mark.skipif(not ILEUM_H5AD.is_file(), reason="ileum demo h5ad missing")
def test_docs_recipe_ileum_n_counts_matches_raw_totals():
    adata = docs_recipe_adata()
    assert adata.n_obs == 30_332
    assert adata.n_vars == 1815
    raw = np.asarray(adata.layers["raw_counts"].sum(axis=1)).ravel()
    np.testing.assert_array_equal(adata.obs["n_counts"].to_numpy(), raw)
    assert float(np.median(raw)) == 48.0


NOTEBOOK = Path(__file__).resolve().parents[1] / "demos" / "recipes" / "squidpy_moran.py"
CONFIG_NAMES = (
    "DEFAULT_GENE",
    "ILEUM_H5AD",
    "MORAN_CACHE_PATH",
    "RECIPE_DATA_DIR",
    "Path",
    "ml",
    "mo",
    "np",
    "pd",
    "plt",
    "sq",
)


def _notebook_fn(name: str):
    src = NOTEBOOK.read_text()
    tree = ast.parse(src)
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            segment = ast.get_source_segment(src, node)
            assert segment is not None
            ns: dict = {}
            exec(segment, ns)
            return ns[name]
    raise AssertionError(name)


def _function_source(name: str) -> str:
    src = NOTEBOOK.read_text()
    tree = ast.parse(src)
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            segment = ast.get_source_segment(src, node)
            assert segment is not None
            return segment
    raise AssertionError(name)


def test_moran_notebook_keeps_squidpy_out_of_the_plot_cell():
    src = NOTEBOOK.read_text()
    assert "https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_moran.py" in src
    assert "https://www.nature.com/articles/s41467-025-56080-w" in src
    assert "{{TOP20_SHARED}}" in src
    assert "{{N_COUNTS_MEDIAN}}" in src
    assert "ileum_moran_recipe_scores.parquet" in src
    setup = _function_source("moran_setup")
    assert "sq.gr.spatial_neighbors_knn(adata, n_neighs=6, percentile=99)" in setup
    assert 'mode="moran"' in setup
    assert "n_perms=100" in setup
    assert 'startswith("Enterocyte")' in setup
    assert "0.05" in setup
    assert "if not all(col in adata.var.columns for col in needed)" in setup
    plots = _function_source("moran_plots")
    assert "spatial_autocorr" not in plots
    assert "spatial_neighbors" not in plots
    assert "sq." not in plots
    assert "w.color" in plots
    landmark = _function_source("landmark_map")
    assert "genes=list(adata.var_names)" in landmark
    assert "w.color = DEFAULT_GENE" in landmark
    assert "mesh_opacity" in landmark
    assert 'DEFAULT_GENE = "Apob"' in src


def test_moran_setup_skips_squidpy_when_scores_are_already_on_var(tmp_path):
    class _Boom:
        def __getattr__(self, name):
            raise AssertionError(name)

    adata = adata_xy(
        [0.0, 1.0],
        [0.0, 1.0],
        color=["Enterocyte (top)", "Fibroblast"],
        color_key="cell_type",
        genes={"Apob": [1.0, 0.0], "Acta2": [0.0, 1.0]},
    )
    adata.var["moran_I_all"] = [0.4, 0.1]
    adata.var["moran_I_enterocyte"] = [0.3, 0.0]
    _notebook_fn("moran_setup")(adata, tmp_path / "scores.parquet", np, pd, _Boom())
    assert not (tmp_path / "scores.parquet").exists()


def _ileum_recipe():
    config = _notebook_fn("recipe_config")()
    env = dict(zip(CONFIG_NAMES, config, strict=True))
    adata, cache = _notebook_fn("load_adata")(
        env["ILEUM_H5AD"],
        env["MORAN_CACHE_PATH"],
        env["Path"],
        env["ml"],
        env["np"],
        env["pd"],
    )
    return adata, cache, env


@pytest.mark.skipif(not ILEUM_H5AD.is_file(), reason="ileum demo h5ad missing")
def test_load_adata_attaches_n_counts_without_computing_moran():
    adata, cache, env = _ileum_recipe()
    assert env["DEFAULT_GENE"] == "Apob"
    assert adata.n_obs == 30_332
    assert "n_counts" in adata.obs.columns
    assert float(np.median(adata.obs["n_counts"])) == 48.0
    if cache.is_file():
        assert pd.notna(adata.var.at["Apob", "moran_I_all"])
        assert pd.notna(adata.var.at["Apob", "moran_I_enterocyte"])
    else:
        assert "moran_I_all" not in adata.var.columns


@pytest.mark.skipif(not ILEUM_H5AD.is_file(), reason="ileum demo h5ad missing")
def test_moran_plots_highlights_the_picked_gene():
    adata, _cache, env = _ileum_recipe()
    adata.var["moran_I_all"] = 0.05
    adata.var["moran_I_enterocyte"] = 0.05
    adata.var.loc["Apob", "moran_I_all"] = 0.82
    adata.var.loc["Apob", "moran_I_enterocyte"] = 0.74

    class _Pick:
        color = "Apob"

    before = set(plt.get_fignums())
    _notebook_fn("moran_plots")(adata, env["np"], env["pd"], env["plt"], _Pick())
    fig = plt.figure((set(plt.get_fignums()) - before).pop())
    fig.canvas.draw()
    assert any(text.get_text() == "Apob" for text in fig.axes[0].texts)
    assert fig.axes[1].get_title() == "Apob"
    labels = [label.get_text() for label in fig.axes[1].get_yticklabels()]
    assert any(label.startswith("Enterocyte") for label in labels)
    plt.close(fig)

    _Pick.color = "n_counts"
    before = set(plt.get_fignums())
    _notebook_fn("moran_plots")(adata, env["np"], env["pd"], env["plt"], _Pick())
    fig = plt.figure((set(plt.get_fignums()) - before).pop())
    assert any("not a gene" in text.get_text() for text in fig.axes[1].texts)
    assert not any(text.get_text() == "n_counts" for text in fig.axes[0].texts)
    plt.close(fig)


def test_moran_setup_writes_the_score_table_when_var_has_no_scores(tmp_path):
    pytest.importorskip("squidpy")
    n = 40
    x = [float(i) for i in range(n)]
    types = ["Enterocyte (top)"] * 20 + ["Fibroblast"] * 20
    apob = [i / 4 for i in range(20)] + [0.0] * 20
    acta = [0.0] * 20 + [i / 5 for i in range(20)]
    adata = adata_xy(
        x,
        [0.0] * n,
        color=types,
        color_key="cell_type",
        genes={"Apob": apob, "Acta2": acta},
    )
    config = _notebook_fn("recipe_config")()
    env = dict(zip(CONFIG_NAMES, config, strict=True))
    cache = tmp_path / "ileum_moran_recipe_scores.parquet"
    _notebook_fn("moran_setup")(adata, cache, env["np"], env["pd"], env["sq"])
    scores = read_moran_scores(cache)
    assert scores is not None
    assert list(scores.columns) == list(MORAN_COLUMNS)
    assert scores.index.tolist() == ["Apob", "Acta2"]
    assert pd.notna(scores.loc["Apob", "moran_I_all"])
    assert pd.notna(scores.loc["Apob", "moran_I_enterocyte"])
    assert pd.isna(scores.loc["Acta2", "moran_I_enterocyte"])
    assert "moran_I_all" in adata.var.columns


def test_moran_plots_marks_a_gene_with_no_enterocyte_score():
    config = _notebook_fn("recipe_config")()
    env = dict(zip(CONFIG_NAMES, config, strict=True))
    adata = adata_xy(
        [0, 1, 2, 3],
        [0, 0, 1, 1],
        color=["Enterocyte (top)", "Enterocyte (top)", "Fibroblast", "Fibroblast"],
        color_key="cell_type",
        genes={"Apob": [1.0, 2.0, 0.0, 0.0], "Acta2": [0.0, 0.0, 3.0, 1.0]},
    )
    adata.var["moran_I_all"] = [0.63, 0.74]
    adata.var["moran_I_enterocyte"] = [0.52, np.nan]

    class _Pick:
        color = "Acta2"

    before = set(plt.get_fignums())
    _notebook_fn("moran_plots")(adata, env["np"], env["pd"], env["plt"], _Pick())
    fig = plt.figure((set(plt.get_fignums()) - before).pop())
    labels = [text.get_text() for text in fig.axes[0].texts]
    assert "Acta2 not scored in enterocytes" in labels
    assert fig.axes[1].get_title() == "Acta2"
    plt.close(fig)
