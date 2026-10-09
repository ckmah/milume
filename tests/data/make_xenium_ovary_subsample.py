#!/usr/bin/env python3
"""Materialize ``tests/data/xenium_ovary_subsample`` from 10x Human Ovary tiny outs.

Source (not committed; CC BY 4.0 — 10x Genomics public datasets):
  https://cf.10xgenomics.com/samples/xenium/4.0.0/Xenium_V1_Human_Ovary_tiny/Xenium_V1_Human_Ovary_tiny_outs.zip

Copies only the files ``spatialdata_io.xenium()`` needs for widget tests (no
transcripts, no morphology.ome.tif, no HTML/aux archives). Cell count is unchanged.

Usage:
    unzip Xenium_V1_Human_Ovary_tiny_outs.zip -d /tmp/xenium_src
    python tests/data/make_xenium_ovary_subsample.py /tmp/xenium_src
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

FILES = (
    "experiment.xenium",
    "gene_panel.json",
    "metrics_summary.csv",
    "cells.parquet",
    "cell_feature_matrix.h5",
    "cells.zarr.zip",
)
DIRS = ("morphology_focus",)

OUT = Path(__file__).resolve().parent / "xenium_ovary_subsample"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Unzipped Xenium_V1_Human_Ovary_tiny outs directory")
    args = parser.parse_args(argv)
    src = args.source.resolve()
    if not (src / "experiment.xenium").is_file():
        raise SystemExit(f"not a Xenium outs folder: {src}")

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    for name in FILES:
        shutil.copy2(src / name, OUT / name)
    for name in DIRS:
        shutil.copytree(src / name, OUT / name)

    print(f"wrote {OUT} ({sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file()) // 1024} KiB)")


if __name__ == "__main__":
    main(sys.argv[1:])
