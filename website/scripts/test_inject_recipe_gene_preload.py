#!/usr/bin/env python3
"""Tests for inject_recipe_gene_preload."""

from __future__ import annotations

import json
from pathlib import Path

from inject_recipe_gene_preload import inject_landmark_map_genes

from moran_static_page_genes import static_page_gene_count


def test_inject_landmark_map_genes_sets_gzip_codec(tmp_path: Path) -> None:
    state = {
        "points_data": "AAAA",
        "_esm": "export const bundle = '" + ("x" * 50_000) + "';",
        "gene_names": [{"name": "Apob"}],
        "gene_csc_indptr": "",
        "gene_csc_indices": "",
        "gene_csc_data": "",
        "gene_csc_codec": "",
        "_gene_csc_codec": "",
    }
    cell = {
        "resources": {
            "modelNotifications": [{"message": {"state": state}}],
        }
    }
    path = tmp_path / "big.cell.json"
    path.write_text(json.dumps(cell))

    import milume as ml
    import numpy as np

    ileum = Path(__file__).resolve().parents[2] / "demos" / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum)
    adata.obs["n_counts"] = np.asarray(adata.layers["raw_counts"].sum(axis=1)).ravel()
    from inject_recipe_gene_preload import _map_adata_for_widget

    adata_map = _map_adata_for_widget(adata)
    assert adata_map.n_obs == adata.n_obs
    assert inject_landmark_map_genes(path, adata_map)[0]
    updated = json.loads(path.read_text())
    new_state = updated["resources"]["modelNotifications"][0]["message"]["state"]
    assert new_state["_gene_csc_codec"] == "gzip"
    assert "gene_csc_data" not in new_state
    assert "_esm" not in new_state
    assert len(new_state["gene_names"]) == static_page_gene_count
    assert len(new_state["_gene_csc_data"]) > 1000
    heavy = sum(len(v) for v in new_state.values() if isinstance(v, str))
    # Page total budget is 16 MB. The Nov 6 Pages run spent ~9.5 MB beside this cell.
    assert heavy < 6_000_000, (static_page_gene_count, heavy, len(path.read_bytes()))
