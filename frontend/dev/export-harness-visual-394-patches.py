#!/usr/bin/env python3
"""Write harness colour patches for #394 visual acceptance (four modes, two API shapes)."""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402
from milume.fixture_export import widget_fixture_snapshot  # noqa: E402
from tests.helpers import adata_xy  # noqa: E402

DEV = Path(__file__).resolve().parent
OUT = DEV / "harness-visual-394"

LEGACY_KEYS = [
    "color",
    "color_mode",
    "category_columns",
    "category_codes",
    "active_category",
    "active_genes",
    "legend_labels",
    "legend_title",
    "point_palette",
    "color_vmin",
    "color_vmax",
    "gene_csc_indptr",
    "gene_csc_indices",
    "gene_csc_data",
    "gene_scale_mode",
    "gene_log1p",
    "raster_basis",
    "raster_embedding_key",
    "raster_embedding_dims",
    "embedding_values",
    "embedding_channel_labels",
    "embedding_matrix",
    "embedding_matrix_dim",
    "points_data",
]


def _harness_adata():
    fixture = json.loads((DEV / "fixture.json").read_text())
    pts = np.frombuffer(base64.b64decode(fixture["points_data"]), dtype=np.float32).reshape(-1, 4)
    (x0, x1), (y0, y1) = fixture["x_bounds"], fixture["y_bounds"]
    x = x0 + (pts[:, 0].astype(np.float64) + 1.0) * (x1 - x0) / 2.0
    y = y0 + (pts[:, 1].astype(np.float64) + 1.0) * (y1 - y0) / 2.0
    return x, y, len(x)


def _legacy_patch(w: LandmarksWidget) -> dict:
    return {k: getattr(w, k) for k in LEGACY_KEYS if hasattr(w, k)}


def _color_api_patch(w: LandmarksWidget) -> dict:
    snap = widget_fixture_snapshot(w)
    keys = [
        "color",
        "active_category",
        "active_genes",
        "_color_options",
        "_color_state",
        "_look",
        "_category_columns",
        "_category_codes",
        "_gene_csc_indptr",
        "_gene_csc_indices",
        "_gene_csc_data",
        "_embedding_values",
        "_embedding_channel_labels",
        "_embedding_matrix",
        "_embedding_matrix_dim",
        "points_data",
    ]
    return {k: snap[k] for k in keys if k in snap}


def _write(name: str, w: LandmarksWidget) -> None:
    path = OUT / f"{name}.json"
    doc = json.loads(path.read_text()) if path.is_file() else {}
    doc["colorApi"] = _color_api_patch(w)
    path.write_text(json.dumps(doc) + "\n")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    x, y, n = _harness_adata()

    twin = np.where(np.arange(n) % 2 == 0, "group_a", "group_b")
    w_cat = LandmarksWidget(adata_xy(x, y, color=twin, color_key="harness_twin"))
    w_cat.color = "harness_twin"
    _write("categorical", w_cat)

    area = np.linspace(10.0, 10.0 + n - 1, n)
    adata_num = adata_xy(x, y)
    adata_num.obs["harness_area"] = area
    adata_num.obs["harness_twin"] = twin
    w_num = LandmarksWidget(adata_num)
    w_num.color = "harness_area"
    _write("numeric", w_num)

    rng = np.random.default_rng(394)
    genes = np.stack(
        [
            rng.uniform(0, 3, n).astype(np.float32),
            rng.uniform(0, 2, n).astype(np.float32),
        ],
        axis=1,
    )
    w_genes = LandmarksWidget(
        adata_xy(x, y, genes={"Abtb3": genes[:, 0], "Adamts2": genes[:, 1]}),
        genes=["Abtb3", "Adamts2"],
    )
    w_genes.color = ["Abtb3", "Adamts2"]
    _write("gene-blend", w_genes)

    adata_emb = adata_xy(x, y)
    adata_emb.obsm["X_pca"] = rng.standard_normal((n, 3)).astype(np.float32)
    w_emb = LandmarksWidget(adata_emb)
    w_emb.color = "X_pca"
    look = dict(w_emb._look)
    look["raster_embedding_dims"] = [0, 1, 2]
    w_emb._look = look
    w_emb._pack_embedding_values()
    w_emb._pack_embedding_matrix()
    _write("embedding", w_emb)

    print(f"wrote 4 mode patches under {OUT}")


if __name__ == "__main__":
    main()
