#!/usr/bin/env python3
"""Export landmarks harness JSON from Hugging Face Stellaromics/demo **mouse brain** Pyxa slices.

Profiles (``xsmall/``, ``small/`` on HF — **not colon**):
- ``xsmall``: ~187 cells (~10 MB HF tree) — default CI harness ``fixture.json``.
- ``small``: 4,372 cells (~200 MB HF tree) — timing / edge sweeps (gitignored JSON).

Do **not** join colon annotations onto these slices by ``cell_id`` / Region_N-style IDs:
brain and colon demo IDs overlap (~3.6k collisions). Use colon export for colon biology.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402

DEV = Path(__file__).resolve().parent

FIXTURE_KEYS = [
    "mode",
    "selections",
    "landmarks",
    "selected_kind",
    "selected_index",
    "category_columns",
    "active_category",
    "gene_columns",
    "active_genes",
    "gene_scale_mode",
    "gene_log1p",
    "gene_expression_logged",
    "color_by",
    "legend_labels",
    "legend_title",
    "type_neighborhoods",
    "default_buffer_width",
    "neighbor_radius_max",
    "neighbor_k_max",
    "gene_format",
    "gene_csc_indptr",
    "gene_csc_indices",
    "gene_csc_data",
    "x_bounds",
    "y_bounds",
    "point_size",
    "points_data",
    "point_palette",
    "category_codes",
    "gene_values",
    "color_vmin",
    "color_vmax",
    "render_mode",
    "raster_bin_size",
    "raster_window_radius",
    "raster_basis",
    "raster_embedding_key",
    "raster_embedding_keys",
    "raster_embedding_dims",
    "embedding_values",
    "embedding_channel_labels",
    "embedding_matrix",
    "embedding_matrix_dim",
    "raster_obs_key",
    "raster_gene_mode",
    "raster_origin_x",
    "raster_origin_y",
    "raster_n_cols",
    "raster_n_rows",
    "raster_n_bins",
    "raster_bin_rows",
    "raster_bin_cols",
    "raster_bin_counts",
    "raster_features",
    "raster_feature_dim",
    "raster_feature_labels",
    "raster_query_bin",
    "raster_similarity_enabled",
    "raster_threshold",
    "raster_status",
]

PROFILE_OUT = {
    "xsmall": DEV / "fixture.json",
    "small": DEV / "pyxa-small-fixture.json",
}


def _apply_harness_chrome(widget: LandmarksWidget, payload: dict) -> None:
    """Preload selections + landmarks so landmarks.spec.ts can focus them."""
    x0, x1 = payload["x_bounds"]
    y0, y1 = payload["y_bounds"]
    mx = (x0 + x1) * 0.5
    my = (y0 + y1) * 0.5
    dx = (x1 - x0) * 0.38
    dy = (y1 - y0) * 0.38
    radius = float(payload.get("neighbor_radius_max") or 0.0) * 0.35
    if radius <= 0:
        radius = min(dx, dy) * 0.6

    widget.selections = [
        {
            "id": "lasso-radius",
            "type": "polygon",
            "vertices": [
                [mx - dx, my - dy],
                [mx + dx, my - dy],
                [mx + dx, my + dy],
                [mx - dx, my + dy],
            ],
            "neighborhood": "radius",
            "neighborhood_radius": radius,
        },
        {
            "id": "lasso-knn",
            "type": "polygon",
            "vertices": [
                [mx - dx * 0.55, my - dy * 0.55],
                [mx + dx * 0.55, my - dy * 0.55],
                [mx + dx * 0.55, my + dy * 0.55],
                [mx - dx * 0.55, my + dy * 0.55],
            ],
            "neighborhood": "knn",
            "neighborhood_k": 8,
        },
    ]
    widget.landmarks = [
        {
            "id": "harness-point",
            "type": "point",
            "vertices": [[mx - dx * 0.2, my - dy * 0.2]],
        },
        {
            "id": "harness-line",
            "type": "line",
            "vertices": [
                [mx - dx * 0.15, my + dy * 0.1],
                [mx + dx * 0.1, my + dy * 0.15],
                [mx + dx * 0.2, my - dy * 0.05],
            ],
        },
    ]


def load_adata(profile: str):
    from pathlib import Path as P

    from huggingface_hub import snapshot_download
    from spatialdata_io.experimental import pyxa

    data_dir = (
        P(
            snapshot_download(
                "Stellaromics/demo",
                repo_type="dataset",
                allow_patterns=f"{profile}/*",
                ignore_patterns="*cell_assigned_gene*",
            )
        )
        / profile
    )
    sdata = pyxa(data_dir, cell_assigned_gene=False, labels=True)
    return sdata.tables["rna"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--profile",
        choices=("xsmall", "small"),
        default="xsmall",
        help="HF demo slice (default: xsmall for CI fixture)",
    )
    args = parser.parse_args()
    adata = load_adata(args.profile)
    color_key = "region" if "region" in adata.obs.columns else None
    widget = LandmarksWidget(
        adata,
        spatial_key="spatial",
        color=color_key,
    )
    # Harness label only — mouse brain demo slice for timing/CI, not colon tissue.
    widget.legend_title = (
        f"{color_key or 'points'} (mouse brain · Stellaromics/demo {args.profile}/)"
    )
    widget.selected_kind = ""
    widget.selected_index = -1
    widget.raster_similarity_enabled = False
    widget.raster_query_bin = -1

    dest = PROFILE_OUT[args.profile]
    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS}
    if args.profile == "xsmall":
        _apply_harness_chrome(widget, payload)
        payload = {key: getattr(widget, key) for key in FIXTURE_KEYS}
    dest.write_text(json.dumps(payload, separators=(",", ":")))
    n = adata.n_obs
    xb, yb = payload["x_bounds"], payload["y_bounds"]
    print(
        f"wrote {dest} profile={args.profile} n={n} "
        f"({dest.stat().st_size // 1024} KiB) "
        f"x=[{xb[0]:.1f},{xb[1]:.1f}] y=[{yb[0]:.1f},{yb[1]:.1f}]"
    )


if __name__ == "__main__":
    main()
