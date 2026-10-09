#!/usr/bin/env python3
"""Export gitignored colon A2 fixtures (real positions + cluster labels, colon rows only).

Data: Hugging Face ``Stellaromics/demo/colon/`` only. Each row's ``X_um``/``Y_um``/``Z_um``
and ``Cluster`` come from the same Studio-kept colon join (``cell_metadata_v1.csv`` ⨝
``pyxa_studio_v1.csv`` on ``cell_id``). Subsamples pick whole rows — never attach colon
labels to ``xsmall/``/``small/`` mouse brain by ``cell_id`` (ID collisions with colon).

Usage::

  uv run --extra demo --directory .. python frontend/dev/export-colon-a2-harness-fixture.py --cells 5000
  uv run --extra demo --directory .. python frontend/dev/export-colon-a2-harness-fixture.py --cells full
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


def load_colon_studio_kept():
    import numpy as np
    import pandas as pd
    from huggingface_hub import snapshot_download

    base = Path(
        snapshot_download(
            "Stellaromics/demo",
            repo_type="dataset",
            allow_patterns=[
                "colon/pyxa_studio_v1.csv",
                "colon/cell_metadata_v1.csv",
            ],
        )
    )
    meta = pd.read_csv(base / "colon" / "cell_metadata_v1.csv")
    studio = pd.read_csv(base / "colon" / "pyxa_studio_v1.csv")
    # Inner join on colon ``cell_id`` only; positions and Cluster stay on the same row.
    merged = meta.merge(studio[["cell_id", "Cluster"]], on="cell_id", how="inner")
    merged = merged[merged["Cluster"].notna()].reset_index(drop=True)
    return merged, np


def fixture_path(cells: int) -> Path:
    if cells >= 358_173:
        return DEV / "colon-a2-fixture.json"
    return DEV / f"colon-a2-n{cells}-fixture.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cells",
        default="full",
        help="Subsample size (e.g. 5000) or 'full' for all Studio-kept cells",
    )
    parser.add_argument("--seed", type=int, default=92, help="RNG seed for subsample")
    args = parser.parse_args()

    merged, np = load_colon_studio_kept()
    n_full = len(merged)
    if args.cells == "full":
        n_take = n_full
    else:
        n_take = min(int(args.cells), n_full)

    rng = np.random.default_rng(args.seed)
    pick = rng.choice(n_full, size=n_take, replace=False)
    # Subsample rows so spatial coords and Cluster label remain paired.
    merged = merged.iloc[pick].reset_index(drop=True)

    from anndata import AnnData

    coords = merged[["X_um", "Y_um", "Z_um"]].to_numpy(dtype=np.float64)
    adata = AnnData(X=np.zeros((n_take, 1), dtype=np.float32))
    adata.obsm["spatial"] = coords
    adata.obs["cluster"] = merged["Cluster"].astype(str).values

    widget = LandmarksWidget(adata, color="cluster")
    widget.legend_title = "Cluster (colon A2 · Stellaromics/demo/colon/)"
    widget.selections = []
    widget.landmarks = []
    widget.selected_kind = ""
    widget.selected_index = -1
    widget.raster_similarity_enabled = False
    widget.raster_query_bin = -1

    dest = fixture_path(n_take)
    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS}
    dest.write_text(json.dumps(payload, separators=(",", ":")))
    xb, yb = payload["x_bounds"], payload["y_bounds"]
    print(
        f"wrote {dest} n={n_take} ({dest.stat().st_size // 1024} KiB) "
        f"x=[{xb[0]:.1f},{xb[1]:.1f}] y=[{yb[0]:.1f},{yb[1]:.1f}]"
    )


if __name__ == "__main__":
    main()
