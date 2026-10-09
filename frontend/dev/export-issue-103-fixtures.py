#!/usr/bin/env python3
"""Export harness fixtures for issue #103 platform screenshots."""

from __future__ import annotations

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
    "category_columns",
    "active_category",
    "gene_columns",
    "color_by",
    "legend_labels",
    "legend_title",
    "x_bounds",
    "y_bounds",
    "point_size",
    "points_data",
    "point_palette",
    "category_codes",
    "gene_values",
    "render_mode",
    "raster_bin_size",
    "raster_window_radius",
    "neighbor_radius_max",
    "neighbor_k_max",
]


def _export(widget: LandmarksWidget, dest: Path) -> None:
    payload = {k: getattr(widget, k) for k in FIXTURE_KEYS}
    dest.write_text(json.dumps(payload))
    print(f"wrote {dest} ({dest.stat().st_size // 1024} KiB)")


def main() -> None:
    from tests.fixtures.spatialdata_platforms import (
        write_cosmx_tiny_flatfiles,
        xenium_like_spatialdata,
    )

    spatialdata_io = __import__("spatialdata_io")

    xenium = xenium_like_spatialdata()
    _export(LandmarksWidget(xenium), DEV / "issue-103-xenium-fixture.json")

    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        cosmx_dir = write_cosmx_tiny_flatfiles(Path(tmp))
        cosmx = spatialdata_io.cosmx(cosmx_dir, dataset_id="milume_tiny", transcripts=False)
        _export(LandmarksWidget(cosmx, spatial_key="global"), DEV / "issue-103-cosmx-fixture.json")


if __name__ == "__main__":
    main()
