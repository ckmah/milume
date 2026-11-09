#!/usr/bin/env python3
"""Export committed 2D multichannel SpatialData + harness JSON for depth backdrop (#122)."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget
from milume.fixture_export import FIXTURE_SYNC_KEYS, widget_fixture_snapshot  # noqa: E402
from milume.volume_source import image_contrast_limits  # noqa: E402
from tests.helpers import issue122_2d_multichannel_spatialdata  # noqa: E402

DEV = Path(__file__).resolve().parent
PUBLIC = DEV / "landmarks-volume" / "public"
STORE_NAME = "issue122-2d.sdata.zarr"
OUT = DEV / "landmarks-volume-fixture.issue122-2d.json"

FIXTURE_KEYS = list(FIXTURE_SYNC_KEYS)

VOLUME_KEYS = ["volume", "volume_cell_rows", "volume_cut", "inspect_size_um"]


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
    payload["volume"]["is_3d"] = False
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    mib = sum(f.stat().st_size for f in store.rglob("*") if f.is_file()) / (1024 * 1024)
    print(f"wrote {store} and {OUT} (zarr ~{mib:.2f} MiB, fixture {OUT.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
