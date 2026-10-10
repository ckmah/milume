#!/usr/bin/env python3
"""Build colon A2 SpatialData (pyxa_scverse_demo parity) and export a volume harness fixture.

Downloads ``Stellaromics/demo/colon/`` files used by ``build_colon_a2.py``, writes
``frontend/dev/landmarks-volume/public/colon_a2.sdata.zarr``, and
``frontend/dev/landmarks-volume-fixture.colon.json`` with static ``volume`` URLs
for the Vite harness (``MILUME_VOLUME_PROFILE=colon npm run dev:landmarks-volume``).

Regenerate hero PNGs with ``node frontend/scripts/capture-issue-114-hero.mjs``.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402
from milume.volume_source import image_contrast_limits  # noqa: E402

DEV = ROOT / "frontend" / "dev"
PUBLIC = DEV / "landmarks-volume" / "public"
STORE_NAME = "colon_a2.sdata.zarr"
OUT = DEV / "landmarks-volume-fixture.colon.json"

HF_FILES = [
    "cell_by_gene_v1.csv",
    "cell_metadata_v1.csv",
    "pyxa_studio_v1.csv",
    "segmentation_geometries_v1.parquet",
    "mosaic_3d.ome.zarr.zip",
]

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


def _static_volume_urls(volume: dict[str, object]) -> dict[str, object]:
    out = dict(volume)
    for key in ("image_url", "labels_url"):
        url = str(out.get(key) or "")
        if not url:
            continue
        path = urlparse(url).path
        out[key] = f"/{STORE_NAME}{path}"
    return out


def download_colon_source(dest: Path) -> Path:
    from huggingface_hub import snapshot_download

    snapshot_download(
        "Stellaromics/demo",
        repo_type="dataset",
        allow_patterns=[f"colon/{f}" for f in HF_FILES],
        local_dir=dest.parent,
    )
    return dest


def read_colon_sdata(source: Path):
    import spatialdata as sd
    from spatialdata_io.experimental import pyxa

    store = PUBLIC / STORE_NAME
    if store.is_dir():
        return sd.read_zarr(store)

    sdata = pyxa(source, cell_assigned_gene=False, labels=True)
    table = sdata.tables["rna"]
    sdata.tables["rna"] = table[table.obs["Cluster"].notna()].copy()
    store.parent.mkdir(parents=True, exist_ok=True)
    sdata.write(store, overwrite=True)
    return sd.read_zarr(store)


def _hero_selection(widget: LandmarksWidget, sdata) -> None:
    import numpy as np
    from matplotlib.path import Path

    from milume.volume_source import _frame

    image_key = next(iter(sdata.images))
    _scale, origin, shape = _frame(sdata.images[image_key], "global")
    mx0 = float(origin[2])
    mx1 = float(origin[2] + shape[2] * _scale[2])
    my0 = float(origin[1])
    my1 = float(origin[1] + shape[1] * _scale[1])
    cx = (mx0 + mx1) / 2
    cy = (my0 + my1) / 2
    w = (mx1 - mx0) * 0.28
    h = (my1 - my0) * 0.24
    vertices = [
        [cx - w / 2, cy - h / 2],
        [cx + w / 2, cy - h / 2],
        [cx + w / 2, cy + h / 2],
        [cx - w / 2, cy + h / 2],
    ]
    x = np.asarray(widget._data_x, dtype=np.float64)
    y = np.asarray(widget._data_y, dtype=np.float64)
    inside = Path(vertices).contains_points(np.column_stack([x, y]))
    point_indices = np.nonzero(inside)[0].astype(int).tolist()
    widget.selections = [
        {
            "id": "hero-region",
            "type": "polygon",
            "vertices": vertices,
            "point_indices": point_indices,
        },
    ]
    widget.selected_kind = "selection"
    widget.selected_index = 0
    widget.inspect_cx = None
    widget.inspect_cy = None


def write_fixture(sdata, *, cells: int | None, hero: bool) -> None:
    import numpy as np

    table = sdata.tables["rna"]
    if cells is not None and cells < table.n_obs:
        rng = np.random.default_rng(114)
        idx = rng.choice(table.n_obs, size=cells, replace=False)
        sdata.tables["rna"] = table[idx].copy()

    image_key = next(iter(sdata.images))
    contrast = image_contrast_limits(sdata.images[image_key])
    widget = LandmarksWidget(sdata, color="Cluster", contrast_limits=contrast, genes=[])
    widget.set_render_mode("points")
    widget.mode = "select"
    widget.landmarks = []
    if hero:
        _hero_selection(widget, sdata)
    else:
        widget.selections = []
        widget.selected_kind = ""
        widget.selected_index = -1

    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS + VOLUME_KEYS}
    payload["volume"] = _static_volume_urls(payload["volume"])
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    n = sdata.tables["rna"].n_obs
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KiB, n_obs={n}, hero={hero})")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixture-only",
        action="store_true",
        help="skip HF/pyxa build; refresh fixture JSON from an existing zarr store",
    )
    parser.add_argument("--cells", type=int, default=25_000, help="subsample cells for harness JSON")
    parser.add_argument("--hero", action="store_true", help="add the README hero rectangle selection")
    args = parser.parse_args()

    import spatialdata as sd

    store = PUBLIC / STORE_NAME
    if args.fixture_only:
        if not store.is_dir():
            raise SystemExit(f"missing {store}; run without --fixture-only first")
        sdata = sd.read_zarr(store)
    else:
        cache = ROOT / ".cache" / "colon-a2-hf"
        source = cache / "colon"
        if not source.is_dir():
            source = download_colon_source(source)
        sdata = read_colon_sdata(source)

    write_fixture(sdata, cells=args.cells, hero=args.hero)
    if not args.fixture_only:
        print(f"store at {store}")


if __name__ == "__main__":
    main()
