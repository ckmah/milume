"""Regenerate tests/data/cosmx_lung5_tiny from NanoString's public Lung5_Rep2 flat files.

Cut: FOVs 1-2, cells whose centroid lies in the top-left WINDOW x WINDOW pixels
of each FOV image (~218 cells). Note CosMx local y is flipped relative to image
rows (row = FOV_H - 1 - CenterY_local_px), so in local px that window is
x < WINDOW, y >= FOV_H - WINDOW. Keeps the exact CosMx flat-file layout read by
``spatialdata_io.cosmx()``: exprMat, metadata, fov_positions, tx_file, CellLabels/,
CellComposite/. Labels/images are cropped to the same top-left window (so local
pixel coordinates are unchanged) and labels of dropped cells are zeroed.
Only transcripts assigned to kept cells are kept; coordinates rounded to 0.01 px.

Usage (needs ~1.6 GB download; the 3.7 GB tx csv is streamed, never loaded):
    curl -L -o lung5_rep2.tar.gz \
      "https://nanostring-public-share.s3.us-west-2.amazonaws.com/SMI-Compressed/Lung5_Rep2/Lung5_Rep2+SMI+Flat+data.tar.gz"
    python tests/data/make_cosmx_lung5_tiny.py lung5_rep2.tar.gz
"""

from __future__ import annotations

import csv
import io
import sys
import tarfile
from pathlib import Path

import numpy as np
import pandas as pd
import tifffile
from PIL import Image

FOVS = (1, 2)
WINDOW = 1000
FOV_H = 3648  # Lung5 FOV image height (px)
SRC_ID = "Lung5_Rep2"
DST_ID = "Lung5_Rep2_tiny"
PREFIX = f"{SRC_ID}/{SRC_ID}-Flat_files_and_images/"
OUT = Path(__file__).parent / "cosmx_lung5_tiny"


def _member(tar: tarfile.TarFile, name: str):
    return tar.extractfile(PREFIX + name)


def main(tar_path: str) -> None:
    OUT.mkdir(exist_ok=True)
    (OUT / "CellLabels").mkdir(exist_ok=True)
    (OUT / "CellComposite").mkdir(exist_ok=True)
    with tarfile.open(tar_path, "r:gz") as tar:
        meta = pd.read_csv(_member(tar, f"{SRC_ID}_metadata_file.csv"))
        keep = meta[
            meta.fov.isin(FOVS)
            & (meta.CenterX_local_px < WINDOW)
            & (meta.CenterY_local_px >= FOV_H - WINDOW)
        ]
        keep.to_csv(
            OUT / f"{DST_ID}_metadata_file.csv",
            index=False,
            quoting=csv.QUOTE_NONNUMERIC,
        )
        ids = set(zip(keep.fov, keep.cell_ID))

        fovpos = pd.read_csv(_member(tar, f"{SRC_ID}_fov_positions_file.csv"))
        fovpos[fovpos.fov.isin(FOVS)].to_csv(
            OUT / f"{DST_ID}_fov_positions_file.csv", index=False
        )

        # exprMat is ~200 MB: chunked filter
        parts = []
        for ch in pd.read_csv(
            _member(tar, f"{SRC_ID}_exprMat_file.csv"), chunksize=20000
        ):
            m = [(f, c) in ids for f, c in zip(ch.fov, ch.cell_ID)]
            parts.append(ch[m])
        pd.concat(parts).to_csv(OUT / f"{DST_ID}_exprMat_file.csv", index=False)

        for fov in FOVS:
            tag = f"F{fov:03d}"
            lab = tifffile.imread(
                io.BytesIO(_member(tar, f"CellLabels/CellLabels_{tag}.tif").read())
            )
            assert lab.shape[0] == FOV_H, lab.shape
            lab = lab[:WINDOW, :WINDOW].copy()
            kept = keep.loc[keep.fov == fov, "cell_ID"].to_numpy()
            lab[~np.isin(lab, kept)] = 0
            tifffile.imwrite(
                OUT / "CellLabels" / f"CellLabels_{tag}.tif", lab, compression="zlib"
            )
            img = Image.open(_member(tar, f"CellComposite/CellComposite_{tag}.jpg"))
            img.crop((0, 0, WINDOW, WINDOW)).save(
                OUT / "CellComposite" / f"CellComposite_{tag}.jpg", quality=70
            )

        # tx file is ~3.7 GB: stream line by line
        tx = _member(tar, f"{SRC_ID}_tx_file.csv")
        reader = csv.reader(io.TextIOWrapper(tx, newline=""))
        header = next(reader)
        i_fov, i_cell = header.index("fov"), header.index("cell_ID")
        with open(OUT / f"{DST_ID}_tx_file.csv", "w", newline="") as fh:
            w = csv.writer(fh, quoting=csv.QUOTE_NONNUMERIC)
            fh.write(",".join(f'"{h}"' for h in header) + "\n")
            for row in reader:
                fov = int(row[i_fov])
                if fov not in FOVS:
                    if fov > max(FOVS):
                        break  # file is sorted by fov
                    continue
                cell = int(row[i_cell])
                if (fov, cell) in ids:
                    w.writerow([_num(v) for v in row])


def _num(v: str):
    try:
        return int(v)
    except ValueError:
        try:
            return round(float(v), 2)
        except ValueError:
            return v


if __name__ == "__main__":
    main(sys.argv[1])
