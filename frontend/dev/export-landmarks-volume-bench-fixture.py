#!/usr/bin/env python3
"""Build a light harness fixture that uses the Pyxa small zarr with toy chrome (perf bench)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

DEV = Path(__file__).resolve().parent
PUBLIC = DEV / "landmarks-volume" / "public"


def main() -> None:
    toy = json.loads((DEV / "landmarks-volume-fixture.json").read_text())
    small = json.loads((DEV / "landmarks-volume-fixture.small.json").read_text())
    for key in ("volume", "volume_label_ids", "volume_cut", "inspect_size_um", "x_bounds", "y_bounds"):
        toy[key] = small[key]
    comm_path = DEV / "landmarks-volume-fixture.small-bench.json"
    comm_path.write_text(json.dumps(toy, indent=2) + "\n")
    http = json.loads(comm_path.read_text())
    vol = http["volume"]
    for key in ("image_url", "labels_url"):
        url = str(vol.get(key) or "")
        if url and not url.startswith("/"):
            vol[key] = f"/small.sdata.zarr/{url}"
    http_path = DEV / "landmarks-volume-fixture.small-bench.http.json"
    http_path.write_text(json.dumps(http, indent=2) + "\n")
    for name in (comm_path.name, http_path.name):
        (PUBLIC / name).write_text((DEV / name).read_text())
    print(f"wrote {comm_path.name} and {http_path.name}")


if __name__ == "__main__":
    main()
