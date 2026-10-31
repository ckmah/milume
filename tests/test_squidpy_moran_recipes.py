"""Moran's I recipe data rules: n_counts, detected genes, and the score table."""

from __future__ import annotations

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
