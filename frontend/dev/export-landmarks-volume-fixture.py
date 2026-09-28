#!/usr/bin/env python3
"""Export the landmarks-volume harness: a toy SpatialData store plus the widget fixture.

Writes ``landmarks-volume/public/toy.sdata.zarr`` (served by Vite's public dir) and
``landmarks-volume-fixture.json`` from ``LandmarksWidget(sdata, color="cell_type")``.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from spatial_rx import LandmarksWidget  # noqa: E402
from tests.helpers import toy_spatialdata  # noqa: E402

DEV = Path(__file__).resolve().parent
STORE = DEV / "landmarks-volume" / "public" / "toy.sdata.zarr"
OUT = DEV / "landmarks-volume-fixture.json"

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
    "raster_similarity_enabled",
    "raster_query_bin",
    "inspect_cx",
    "inspect_cy",
]

VOLUME_KEYS = ["volume", "volume_label_ids", "volume_cut", "inspect_size_um"]


def main() -> None:
    if STORE.exists():
        shutil.rmtree(STORE)
    STORE.parent.mkdir(parents=True, exist_ok=True)
    sdata = toy_spatialdata(STORE)
    widget = LandmarksWidget(sdata, color="cell_type")
    widget.set_render_mode("points")
    widget.inspect_size_um = 100.0
    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS + VOLUME_KEYS}
    # Served by Vite from the harness public dir instead of the widget's local server.
    payload["volume"] = {
        **payload["volume"],
        "image_url": "/toy.sdata.zarr/images/mosaic/",
        "labels_url": "/toy.sdata.zarr/labels/cells/",
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {STORE} and {OUT} ({OUT.stat().st_size / 1e3:.1f} KB)")


if __name__ == "__main__":
    main()
