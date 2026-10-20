"""Squidpy niche and Moran's I recipes recolour via ``w.color`` (optional extra)."""

from __future__ import annotations

import pytest

pytest.importorskip("squidpy")
pytest.importorskip("scanpy")

from milume import LandmarksWidget

from tests.squidpy_color_recipes import (
    niche_obs_key,
    run_moran_top_gene,
    run_niche_recipe,
    synthetic_recipe_adata,
)


def test_niche_column_recolors_widget():
    adata = synthetic_recipe_adata()
    w = LandmarksWidget(adata, color="cell_type")
    w.selections = [
        {
            "id": "patch",
            "type": "rectangle",
            "cx": 50.0,
            "cy": 50.0,
            "width": 70.0,
            "height": 70.0,
            "angle": 0.0,
        },
    ]
    niche_col = run_niche_recipe(adata, w, "patch")
    assert niche_col == niche_obs_key()
    w.color = niche_col
    assert w.color_mode == "categorical"
    assert w.active_category == niche_col
    assert w.legend_title == niche_col


def test_moran_top_gene_recolors_widget():
    adata = synthetic_recipe_adata()
    w = LandmarksWidget(adata, color="cell_type", genes=list(adata.var_names))
    top_gene = run_moran_top_gene(adata)
    assert top_gene in adata.var_names
    w.color = top_gene
    assert w.color_mode == "continuous"
    assert w.legend_title == top_gene
    assert w.active_genes == [top_gene]
