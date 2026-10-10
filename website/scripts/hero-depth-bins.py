#!/usr/bin/env python3
"""Visible instance counts per camera-relative depth bin (herolib reference)."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("herolib", ROOT / "scripts" / "herolib_v3.py")
herolib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(herolib)

TIMES = [0.6, 3.0, 8.0]
BINS = [0.5, 3, 6, 9, 12, 15, 18, 22, 30]


def visible_z(t: float) -> np.ndarray:
    c, _ = herolib.cam(t)
    z = (herolib.Q0 - c)[:, 2]
    m = (z > 0.5) & (z < 30.0)
    return z[m]


def bin_counts(z: np.ndarray) -> dict[str, int]:
    out = {}
    for i in range(len(BINS) - 1):
        lo, hi = BINS[i], BINS[i + 1]
        key = f"{lo:g}-{hi:g}"
        out[key] = int(((z >= lo) & (z < hi)).sum())
    return out


def main() -> None:
    report = []
    for t in TIMES:
        z = visible_z(t)
        report.append({"t": t, "visible": int(z.size), "bins": bin_counts(z)})
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/cursor/artifacts/hero-ab/depth-bins.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
