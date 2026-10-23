#!/usr/bin/env python3
"""Write dev/harness-twin-obs-color.json: traits from ``w.color = "harness_area"`` on the harness."""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402
from tests.helpers import adata_xy  # noqa: E402

DEV = Path(__file__).resolve().parent
KEYS = [
    "color",
    "color_mode",
    "category_columns",
    "category_codes",
    "active_category",
    "active_genes",
    "legend_labels",
    "legend_title",
    "point_palette",
    "color_vmin",
    "color_vmax",
    "points_data",
]


def main() -> None:
    fixture = json.loads((DEV / "fixture.json").read_text())
    pts = np.frombuffer(base64.b64decode(fixture["points_data"]), dtype=np.float32).reshape(-1, 4)
    (x0, x1), (y0, y1) = fixture["x_bounds"], fixture["y_bounds"]
    x = x0 + (pts[:, 0].astype(np.float64) + 1.0) * (x1 - x0) / 2.0
    y = y0 + (pts[:, 1].astype(np.float64) + 1.0) * (y1 - y0) / 2.0
    n = len(x)
    area = np.linspace(10.0, 10.0 + n - 1, n)
    adata = adata_xy(x, y)
    adata.obs["harness_area"] = area
    adata.obs["harness_twin"] = np.where(np.arange(n) % 2 == 0, "group_a", "group_b")
    w = LandmarksWidget(adata)
    w.color = "harness_area"
    out = {k: getattr(w, k) for k in KEYS}
    (DEV / "harness-twin-obs-color.json").write_text(json.dumps(out) + "\n")


if __name__ == "__main__":
    main()
