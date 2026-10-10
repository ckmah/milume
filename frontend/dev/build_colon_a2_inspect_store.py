#!/usr/bin/env python3
"""Write colon A2 SpatialData for real-kernel Inspect bench (HF ``colon/`` on disk).

Skips 3D label rasterization (``labels=False``) to avoid multi-hour / OOM Pyxa
label painting on this VM. Keeps the full multiscale ``mosaic_image`` OME-Zarr
from ``mosaic_3d.ome.zarr.zip`` and Studio-kept ``rna`` table (``Cluster`` filter).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

DEFAULT_SOURCE = ROOT / "frontend" / "dev" / "data" / "hf" / "colon"
DEFAULT_OUT = ROOT / "frontend" / "dev" / "data" / "colon_a2.sdata.zarr"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    from spatialdata_io.experimental import pyxa

    t0 = time.perf_counter()
    sdata = pyxa(
        args.source,
        cell_assigned_gene=False,
        segmentation_geometries=False,
        labels=False,
    )
    table = sdata.tables["rna"]
    sdata.tables["rna"] = table[table.obs["Cluster"].notna()].copy()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sdata.write(args.out, overwrite=args.overwrite)
    summary = {
        "out": str(args.out),
        "labels_rasterized": False,
        "n_obs": int(sdata.tables["rna"].n_obs),
        "images": list(sdata.images),
        "labels": list(sdata.labels),
        "write_s": round(time.perf_counter() - t0, 1),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
