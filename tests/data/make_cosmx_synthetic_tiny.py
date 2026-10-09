#!/usr/bin/env python3
"""Write ``tests/data/cosmx_synthetic_tiny`` (CosMx flat-file layout, no vendor data)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

DATASET_ID = "milume_cosmx_tiny"
OUT = Path(__file__).resolve().parent / "cosmx_synthetic_tiny"


def write_fixture() -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "CellComposite").mkdir(exist_ok=True)
    (OUT / "CellLabels").mkdir(exist_ok=True)

    rows = []
    for fov in (1, 2):
        for cid in range(1, 4):
            rows.append(
                {
                    "cell_ID": cid,
                    "fov": fov,
                    "CenterX_global_px": fov * 5000 + cid * 100,
                    "CenterY_global_px": cid * 200,
                    "CenterX_local_px": cid * 10,
                    "CenterY_local_px": cid * 20,
                }
            )
    meta = pd.DataFrame(rows)
    meta.to_csv(OUT / f"{DATASET_ID}_metadata_file.csv", index=False)

    counts = meta[["cell_ID", "fov"]].copy()
    counts["GeneA"] = 1
    counts["GeneB"] = 2
    counts.to_csv(OUT / f"{DATASET_ID}_exprMat_file.csv", index=False)

    pd.DataFrame({"fov": [1, 2], "x_global_px": [0, 5000], "y_global_px": [0, 0]}).to_csv(
        OUT / f"{DATASET_ID}_fov_positions_file.csv", index=False
    )
    pd.DataFrame(
        {
            "fov": [1, 1, 2],
            "cell_ID": [1, 2, 1],
            "x_local_px": [1.0, 2.0, 1.0],
            "y_local_px": [3.0, 4.0, 3.0],
            "target": ["GeneA", "GeneB", "GeneA"],
        }
    ).to_csv(OUT / f"{DATASET_ID}_tx_file.csv", index=False)

    for fov in (1, 2):
        rgb = np.zeros((32, 32, 3), dtype=np.uint8)
        rgb[10:20, 10:20, 0] = 200
        Image.fromarray(rgb).save(OUT / "CellComposite" / f"CellComposite_F00{fov}.jpg")
        lab = np.zeros((32, 32), dtype=np.uint16)
        lab[10:20, 10:20] = 1
        Image.fromarray(lab).save(OUT / "CellLabels" / f"CellLabels_F00{fov}.tif")

    return OUT


def main() -> None:
    if OUT.exists():
        import shutil

        shutil.rmtree(OUT)
    path = write_fixture()
    size = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    print(f"wrote {path} ({size // 1024} KiB)")


if __name__ == "__main__":
    main()
