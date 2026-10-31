#!/usr/bin/env python3
"""One export pass: identical widget state → legacy + colorApi harness patches (#394)."""

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

COLOR_API_KEYS = [
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

STATE_TO_LEGACY = {
    "color_mode": "color_mode",
    "legend_title": "legend_title",
    "legend_labels": "legend_labels",
    "raster_basis": "raster_basis",
    "raster_embedding_key": "raster_embedding_key",
}

LOOK_TO_LEGACY = {
    "point_palette": "point_palette",
    "color_vmin": "color_vmin",
    "color_vmax": "color_vmax",
    "gene_scale_mode": "gene_scale_mode",
    "gene_log1p": "gene_log1p",
    "raster_embedding_dims": "raster_embedding_dims",
}

PRIVATE_TO_LEGACY = {
    "_category_columns": "category_columns",
    "_category_codes": "category_codes",
    "_gene_csc_indptr": "gene_csc_indptr",
    "_gene_csc_indices": "gene_csc_indices",
    "_gene_csc_data": "gene_csc_data",
    "_embedding_values": "embedding_values",
    "_embedding_channel_labels": "embedding_channel_labels",
    "_embedding_matrix": "embedding_matrix",
    "_embedding_matrix_dim": "embedding_matrix_dim",
}


def _harness_adata():
    fixture = json.loads((DEV / "fixture.json").read_text())
    pts = np.frombuffer(base64.b64decode(fixture["points_data"]), dtype=np.float32).reshape(-1, 4)
    (x0, x1), (y0, y1) = fixture["x_bounds"], fixture["y_bounds"]
    x = x0 + (pts[:, 0].astype(np.float64) + 1.0) * (x1 - x0) / 2.0
    y = y0 + (pts[:, 1].astype(np.float64) + 1.0) * (y1 - y0) / 2.0
    return x, y, len(x)


def _color_api_patch(snap: dict) -> dict:
    return {k: snap[k] for k in COLOR_API_KEYS if k in snap}


def _legacy_patch(snap: dict) -> dict:
    state = snap.get("_color_state") or {}
    look = snap.get("_look") or {}
    out: dict = {
        "color": snap.get("color", ""),
        "active_category": snap.get("active_category", ""),
        "active_genes": list(snap.get("active_genes") or []),
        "points_data": snap.get("points_data", ""),
    }
    for src, dst in STATE_TO_LEGACY.items():
        out[dst] = state.get(src, "" if dst.endswith("_key") or dst == "legend_title" else [])
    for src, dst in LOOK_TO_LEGACY.items():
        out[dst] = look.get(src, [] if src.endswith("palette") or src.endswith("dims") else 0.0)
    for src, dst in PRIVATE_TO_LEGACY.items():
        out[dst] = snap.get(src, "" if "matrix" in dst or "codes" in dst or "csc" in dst or "values" in dst else [])
    genes = (snap.get("_color_options") or {}).get("genes") or []
    if genes:
        out["gene_names"] = genes
    embeddings = (snap.get("_color_options") or {}).get("embeddings") or {}
    if embeddings:
        out["raster_embedding_keys"] = list(embeddings.keys())
    return out


def _write(name: str, w: LandmarksWidget) -> None:
    snap = widget_fixture_snapshot(w)
    doc = {
        "legacy": _legacy_patch(snap),
        "colorApi": _color_api_patch(snap),
    }
    options = snap.get("_color_options")
    if options is not None:
        doc["shared"] = {"_color_options": options}
    (OUT / f"{name}.json").write_text(json.dumps(doc) + "\n")


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

    print(f"wrote legacy + colorApi patches under {OUT}")


if __name__ == "__main__":
    main()
