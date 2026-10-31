#!/usr/bin/env python3
"""Export committed 2D multichannel SpatialData + harness JSON for depth backdrop (#122)."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402
from milume.volume_source import image_contrast_limits  # noqa: E402
from tests.helpers import issue122_2d_multichannel_spatialdata  # noqa: E402

DEV = Path(__file__).resolve().parent
PUBLIC = DEV / "landmarks-volume" / "public"
STORE_NAME = "issue122-2d.sdata.zarr"
OUT = DEV / "landmarks-volume-fixture.issue122-2d.json"

FIXTURE_KEYS = [
    "mode",
    "selections",
    "landmarks",
    "selected_kind",
    "selected_index",
    "category_columns",
    "active_category",
    "gene_names",
    "active_genes",
    "gene_scale_mode",
    "gene_log1p",
    "gene_expression_logged",
    "color_mode",
    "legend_labels",
    "legend_title",
    "type_neighborhoods",
    "default_buffer_width",
    "neighbor_radius_max",
    "neighbor_k_max",
    "gene_csc_indptr",
    "gene_csc_indices",
    "gene_csc_data",
    "x_bounds",
    "y_bounds",
    "point_size",
    "points_data",
    "point_palette",
    "category_codes",
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

VOLUME_KEYS = ["volume", "volume_cell_rows", "volume_cut", "inspect_size_um"]


def _static_volume_urls(volume: dict[str, object]) -> dict[str, object]:
    from urllib.parse import urlparse

    out = dict(volume)
    for key in ("image_url", "labels_url"):
        url = str(out.get(key) or "")
        if not url:
            continue
        path = urlparse(url).path
        out[key] = f"/{STORE_NAME}{path}"
    return out


def main() -> None:
    store = PUBLIC / STORE_NAME
    if store.exists():
        shutil.rmtree(store)
    store.parent.mkdir(parents=True, exist_ok=True)
    sdata = issue122_2d_multichannel_spatialdata(store)
    image_key = next(iter(sdata.images))
    contrast = image_contrast_limits(sdata.images[image_key])
    widget = LandmarksWidget(sdata, color="cell_type", contrast_limits=contrast)
    widget.set_render_mode("points")
    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS + VOLUME_KEYS}
    payload["volume"] = _static_volume_urls(payload["volume"])
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    mib = sum(f.stat().st_size for f in store.rglob("*") if f.is_file()) / (1024 * 1024)
    print(f"wrote {store} and {OUT} (zarr ~{mib:.2f} MiB, fixture {OUT.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
