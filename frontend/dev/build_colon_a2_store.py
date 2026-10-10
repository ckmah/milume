#!/usr/bin/env python3
"""Build Glasgow colon A2 SpatialData zarr (Stellaromics/demo colon/) for kernel benches.

Mirrors ``stellaromics/pyxa_scverse_demo/build_colon_a2.py``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

HF_REPO = "Stellaromics/demo"
HF_FOLDER = "colon"
HF_FILES = [
    "cell_by_gene_v1.csv",
    "cell_metadata_v1.csv",
    "pyxa_studio_v1.csv",
    "segmentation_geometries_v1.parquet",
    "mosaic_3d.ome.zarr.zip",
]


def download(dest: Path) -> Path:
    from huggingface_hub import snapshot_download

    snapshot_download(
        HF_REPO,
        repo_type="dataset",
        allow_patterns=[f"{HF_FOLDER}/{f}" for f in HF_FILES],
        local_dir=dest.parent,
    )
    return dest


def read(source: Path):
    from spatialdata_io.experimental import pyxa

    if (source / "ag_output").is_dir():
        return pyxa(
            source / "ag_output",
            cell_assigned_gene=False,
            labels=True,
            image=source / "Region" / "mosaic" / "mosaic_3d.ome.zarr",
        )
    return pyxa(source, cell_assigned_gene=False, labels=True)


def main() -> None:
    data = ROOT / "frontend" / "dev" / "data"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=data / "hf" / HF_FOLDER)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--out", type=Path, default=data / "colon_a2.sdata.zarr")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if args.download:
        args.source = download(args.source)
    sdata = read(args.source)
    table = sdata.tables["rna"]
    sdata.tables["rna"] = table[table.obs["Cluster"].notna()].copy()
    t0 = time.perf_counter()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sdata.write(args.out, overwrite=args.overwrite)
    elapsed = time.perf_counter() - t0
    summary = {
        "out": str(args.out),
        "n_obs": int(sdata.tables["rna"].n_obs),
        "labels": list(sdata.labels),
        "images": list(sdata.images),
        "write_s": round(elapsed, 1),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
