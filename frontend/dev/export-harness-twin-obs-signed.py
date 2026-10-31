#!/usr/bin/env python3
"""Write dev/harness-twin-obs-signed.json for diverging obs colour harness tests."""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402
from milume.fixture_export import widget_fixture_snapshot  # noqa: E402
from tests.helpers import adata_xy  # noqa: E402

DEV = Path(__file__).resolve().parent


def main() -> None:
    fixture = json.loads((DEV / "fixture.json").read_text())
    pts = np.frombuffer(base64.b64decode(fixture["points_data"]), dtype=np.float32).reshape(-1, 4)
    (x0, x1), (y0, y1) = fixture["x_bounds"], fixture["y_bounds"]
    x = x0 + (pts[:, 0].astype(np.float64) + 1.0) * (x1 - x0) / 2.0
    y = y0 + (pts[:, 1].astype(np.float64) + 1.0) * (y1 - y0) / 2.0
    n = len(x)
    rng = np.random.default_rng(3941)
    score = rng.uniform(-2.5, 2.5, n)
    score[n // 2] = 0.0
    adata = adata_xy(x, y)
    adata.obs["harness_ulm_score"] = score.astype(np.float64)
    w = LandmarksWidget(adata)
    w.color = "harness_ulm_score"
    snap = widget_fixture_snapshot(w)
    (DEV / "harness-twin-obs-signed.json").write_text(json.dumps(snap) + "\n")


if __name__ == "__main__":
    main()
