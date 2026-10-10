#!/usr/bin/env python3
"""Export the landmarks-volume harness: SpatialData on disk plus widget fixture JSON.

Profiles:

- ``toy`` (default): synthetic store for CI and Playwright (deterministic geometry).
- ``xsmall``: Hugging Face ``Stellaromics/demo`` ``xsmall/`` Pyxa slice (~5 MB mosaic).

Each profile writes ``landmarks-volume/public/<profile>.sdata.zarr`` and a matching
``landmarks-volume-fixture[.xsmall].json``. Vite serves zarr from the public dir and
exports comm-relative ``volume`` URLs (``images/.../``); the harness mock serves
them via ``volume_get`` over the same-origin zarr tree under ``public/``.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402
from milume.volume_cube import TOY_CONTRAST_LIMITS  # noqa: E402
from milume.volume_source import image_contrast_limits  # noqa: E402
from tests.helpers import toy_spatialdata  # noqa: E402

DEV = Path(__file__).resolve().parent
PUBLIC = DEV / "landmarks-volume" / "public"

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


def _write_store_toy(store: Path):
    if store.exists():
        shutil.rmtree(store)
    store.parent.mkdir(parents=True, exist_ok=True)
    return toy_spatialdata(store)


def _write_store_xsmall(store: Path):
    import spatialdata as sd
    from huggingface_hub import snapshot_download
    from spatialdata_io.experimental import pyxa

    if store.exists():
        shutil.rmtree(store)
    store.parent.mkdir(parents=True, exist_ok=True)
    data_dir = (
        Path(
            snapshot_download(
                "Stellaromics/demo",
                repo_type="dataset",
                allow_patterns="xsmall/*",
                ignore_patterns="*cell_assigned_gene*",
            )
        )
        / "xsmall"
    )
    pyxa_sdata = pyxa(
        data_dir,
        cell_assigned_gene=False,
        segmentation_geometries=True,
        labels=True,
    )
    pyxa_sdata.write(store)
    return sd.read_zarr(store)


def export_profile(profile: str) -> None:
    if profile == "toy":
        store_name = "toy.sdata.zarr"
        out = DEV / "landmarks-volume-fixture.json"
        sdata = _write_store_toy(PUBLIC / store_name)
        widget = LandmarksWidget(sdata, color="cell_type", contrast_limits=TOY_CONTRAST_LIMITS)
    elif profile == "xsmall":
        store_name = "xsmall.sdata.zarr"
        out = DEV / "landmarks-volume-fixture.xsmall.json"
        sdata = _write_store_xsmall(PUBLIC / store_name)
        image_key = next(iter(sdata.images))
        contrast = image_contrast_limits(sdata.images[image_key])
        widget = LandmarksWidget(sdata, color="ROI", contrast_limits=contrast)
    else:
        raise SystemExit(f"unknown profile {profile!r} (expected toy or xsmall)")

    widget.set_render_mode("points")
    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS + VOLUME_KEYS}
    payload["volume"] = dict(payload["volume"])
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {PUBLIC / store_name} and {out} ({out.stat().st_size / 1e3:.1f} KB)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--profile",
        choices=("toy", "xsmall"),
        default="toy",
        help="toy: synthetic CI fixture; xsmall: HF Stellaromics/demo xsmall (requires --extra demo)",
    )
    args = parser.parse_args()
    export_profile(args.profile)


if __name__ == "__main__":
    main()
