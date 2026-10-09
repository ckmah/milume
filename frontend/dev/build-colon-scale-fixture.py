#!/usr/bin/env python3
"""Expand dev/fixture points to ~358k cells for colon-scale harness benches."""

from __future__ import annotations

import base64
import json
import struct
from pathlib import Path

import numpy as np

DEV = Path(__file__).resolve().parent
TARGET = 358_173


def main() -> None:
    src = json.loads((DEV / "fixture.json").read_text())
    raw = base64.b64decode(src["points_data"])
    base = np.frombuffer(raw, dtype=np.float32).reshape(-1, 4)
    n0 = base.shape[0]
    reps = (TARGET + n0 - 1) // n0
    tiled = np.tile(base, (reps, 1))[:TARGET].copy()
    # Tiny jitter keeps KD-tree realistic without collapsing to duplicates.
    rng = np.random.default_rng(92)
    tiled[:, 0] += rng.uniform(-1e-4, 1e-4, TARGET).astype(np.float32)
    tiled[:, 1] += rng.uniform(-1e-4, 1e-4, TARGET).astype(np.float32)
    out = dict(src)
    out["points_data"] = base64.b64encode(tiled.astype(np.float32).tobytes()).decode("ascii")
    out["selections"] = []
    dest = DEV / "colon-a2-scale-fixture.json"
    dest.write_text(json.dumps(out))
    print(f"wrote {dest} ({TARGET} points, {dest.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
