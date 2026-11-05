"""Gzip gene CSC payload keeps ileum all-gene exports under the docs data budget."""

from __future__ import annotations

import json

import pytest

from tests.squidpy_color_recipes import ILEUM_H5AD, docs_recipe_adata


@pytest.mark.skipif(not ILEUM_H5AD.is_file(), reason="ileum demo h5ad missing")
def test_ileum_all_genes_gzip_pack_fits_recipe_data_budget():
    from milume import LandmarksWidget

    adata = docs_recipe_adata()
    assert adata.n_vars == 1815
    w = LandmarksWidget(adata, color="cell_type", genes=list(adata.var_names))
    assert w.gene_csc_codec == "gzip"
    state = w.get_state()
    gene_bytes = sum(len(json.dumps(state[k])) for k in state if k.startswith("gene"))
    assert gene_bytes < 6_500_000, f"gene traits {gene_bytes:,} B, expected ~5 MiB gzip"
