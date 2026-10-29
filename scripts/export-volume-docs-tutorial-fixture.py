#!/usr/bin/env python3
"""Export Pyxa small harness JSON with Leiden ``cluster`` for tutorial doc stills."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402
from milume.volume_source import image_contrast_limits  # noqa: E402

DEV = ROOT / "frontend" / "dev"
PUBLIC = DEV / "landmarks-volume" / "public"
OUT = PUBLIC / "landmarks-volume-fixture.small-tutorial.json"

_export_spec = importlib.util.spec_from_file_location(
    "export_landmarks_volume_fixture",
    DEV / "export-landmarks-volume-fixture.py",
)
_export = importlib.util.module_from_spec(_export_spec)
assert _export_spec.loader is not None
_export_spec.loader.exec_module(_export)
FIXTURE_KEYS = _export.FIXTURE_KEYS
VOLUME_KEYS = _export.VOLUME_KEYS


def main() -> None:
    import scanpy as sc
    import spatialdata as sd

    store = PUBLIC / "small.sdata.zarr"
    if not (store / "zarr.json").is_file():
        raise SystemExit(
            f"missing {store}; run: cd frontend && npm run dev:fixture:volume-small-if-missing",
        )
    sdata = sd.read_zarr(store)
    adata = sdata.tables[next(iter(sdata.tables.keys()))].copy()
    sc.pp.log1p(adata)
    sc.pp.pca(adata)
    sc.pp.neighbors(adata)
    sc.tl.leiden(adata, key_added="cluster", flavor="leidenalg", n_iterations=2)
    table_name = next(iter(sdata.tables.keys()))
    sdata.tables[table_name] = adata

    image_key = next(iter(sdata.images))
    contrast = image_contrast_limits(sdata.images[image_key])
    widget = LandmarksWidget(sdata, color="cluster", contrast_limits=contrast)
    widget.set_render_mode("points")
    widget.mode = "select"
    widget.selections = []
    widget.selected_kind = ""
    widget.selected_index = -1

    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS + VOLUME_KEYS}
    payload["volume"] = dict(payload["volume"])
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e3:.1f} KB) active_category=cluster")


if __name__ == "__main__":
    main()
