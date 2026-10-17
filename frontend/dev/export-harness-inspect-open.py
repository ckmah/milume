#!/usr/bin/env python3
"""Write dev/harness-inspect-open.json: the traits ``w.inspect_open = True`` sends.

Builds the widget on the landmarks-volume harness store (``toy.sdata.zarr``), opens
the Inspect cube from Python with no window placed (so it opens at the volume
centre) and keeps the traits the browser reads. The Inspect e2e applies them
instead of clicking the map to open the cube (#215).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import spatialdata as sd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402

DEV = Path(__file__).resolve().parent
KEYS = ["inspect_cx", "inspect_cy", "inspect_open"]


def main() -> None:
    w = LandmarksWidget(sd.read_zarr(DEV / "landmarks-volume" / "public" / "toy.sdata.zarr"))
    w.inspect_open = True
    out = {k: getattr(w, k) for k in KEYS}
    (DEV / "harness-inspect-open.json").write_text(json.dumps(out) + "\n")


if __name__ == "__main__":
    main()
