#!/usr/bin/env python3
"""Export harness fixtures for Squidpy color recipe doc screenshots."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402
from tests.squidpy_color_recipes import (  # noqa: E402
    run_moran_top_gene,
    run_niche_recipe,
    synthetic_recipe_adata,
)

DEV = Path(__file__).resolve().parent

FIXTURE_KEYS = [
    "mode",
    "selections",
    "landmarks",
    "category_columns",
    "active_category",
    "gene_names",
    "gene_csc_indptr",
    "gene_csc_indices",
    "gene_csc_data",
    "active_genes",
    "color_mode",
    "legend_labels",
    "legend_title",
    "x_bounds",
    "y_bounds",
    "point_size",
    "points_data",
    "point_palette",
    "category_codes",
    "render_mode",
]


def _export(widget: LandmarksWidget, dest: Path) -> None:
    payload = {k: getattr(widget, k) for k in FIXTURE_KEYS}
    dest.write_text(json.dumps(payload) + "\n")
    print(f"wrote {dest}")


def main() -> None:
    pytest = __import__("pytest")
    pytest.importorskip("squidpy")
    pytest.importorskip("scanpy")

    adata = synthetic_recipe_adata(n=200, seed=2)
    w = LandmarksWidget(adata, color="cell_type", genes=list(adata.var_names))
    w.selections = [
        {
            "id": "patch",
            "type": "rectangle",
            "cx": 50.0,
            "cy": 50.0,
            "width": 80.0,
            "height": 80.0,
            "angle": 0.0,
        },
    ]

    niche_col = run_niche_recipe(adata, w, "patch")
    w.color = niche_col
    _export(w, DEV / "squidpy-niche-fixture.json")

    top_gene = run_moran_top_gene(adata)
    w.color = top_gene
    _export(w, DEV / "squidpy-moran-fixture.json")


if __name__ == "__main__":
    main()
