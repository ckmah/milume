# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "anndata>=0.10",
#   "h5py>=3.10",
#   "numpy>=1.26",
#   "pandas>=2.0",
#   "rapidgzip>=0.14",
# ]
# ///
"""Regenerate demos/data/ileum.h5ad from the Xu et al. 2026 Dryad zip.

Source: Dryad doi:10.5061/dryad.p5hqbzm0z, ``data_upload.zip`` (26.4 GB,
sha256 541e4f69...f15ee, CC0-1.0). The pooled
``cell_by_gene/cell_by_gene_with_metadata.h5ad`` member is 62.9 GB once
inflated, so this script never extracts it: it reads the deflate stream with
random access (rapidgzip) and opens it with h5py, touching only the obs columns
plus the rows of one slice and the columns of the chosen genes.

Output matches the old ileum.h5ad layout (ckmah/milume 4deb533^):
  X                float32, source adata.X (the authors' log-normalized values)
  obs              cell_type, cell_class, anatomical_layer (categoricals),
                   mucosal_pseudospace (float64); index c0..cN
  obsm['spatial']  float64 (x [um], y [um]) cell centroids
  uns['cell_type_colors']  size-matched tab20/tab20b/tab20c cycle
  gzip compression (anndata default level 4)

Usage:
  uv run --script export_from_raw.py --zip /path/to/data_upload.zip --out ileum.h5ad
"""

from __future__ import annotations

import argparse
import io
import os
import struct
import sys
import zipfile
from pathlib import Path

import anndata as ad
import h5py
import numpy as np
import pandas as pd

MEMBER = "data_upload/cell_by_gene/cell_by_gene_with_metadata.h5ad"
SLICE = "20211215_WT_ile1_slice_2"  # SPF ileum, complete cross-section with GALT follicles
GENES = [
    # epithelium and the crypt-villus axis
    "Apob",    # villus-tip enterocytes (rho +0.59 with mucosal_pseudospace)
    "Slc5a1",  # SGLT1, villus enterocytes (rho +0.55)
    "Nos2",    # villus epithelium (rho +0.50)
    "Cps1",    # crypt / lower-villus enterocytes (rho -0.59)
    "Mki67",   # proliferating transit-amplifying crypt cells (rho -0.45)
    "Lgr5",    # crypt-base stem cells (sparse, kept for docs continuity)
    "Erbb3",   # pan-epithelial (81% of epithelial cells vs 3% elsewhere)
    "H2-Eb1",  # MHC-II: epithelium and antigen-presenting cells
    # wall layers
    "Acta2",   # smooth muscle, Muscularis Propria (97% of SMC)
    "Col1a1",  # fibroblasts, Submucosa
    "Phox2b",  # enteric neurons, Myenteric Plexus
    "Kit",     # interstitial cells of Cajal
    "Pecam1",  # endothelium
    # immune
    "Mzb1",    # plasma cells (lamina propria)
    "Cd3e",    # T cells
    "Csf1r",   # macrophages
]
PALETTE60 = [
    "#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c", "#98df8a", "#d62728", "#ff9896",
    "#9467bd", "#c5b0d5", "#8c564b", "#c49c94", "#e377c2", "#f7b6d2", "#7f7f7f", "#c7c7c7",
    "#bcbd22", "#dbdb8d", "#17becf", "#9edae5", "#393b79", "#5254a3", "#6b6ecf", "#9c9ede",
    "#637939", "#8ca252", "#b5cf6b", "#cedb9c", "#8c6d31", "#bd9e39", "#e7ba52", "#e7cb94",
    "#843c39", "#ad494a", "#d6616b", "#e7969c", "#7b4173", "#a55194", "#ce6dbd", "#de9ed6",
    "#3182bd", "#6baed6", "#9ecae1", "#c6dbef", "#e6550d", "#fd8d3c", "#fdae6b", "#fdd0a2",
    "#31a354", "#74c476", "#a1d99b", "#c7e9c0", "#756bb1", "#9e9ac8", "#bcbddc", "#dadaeb",
    "#636363", "#969696", "#bdbdbd", "#d9d9d9",
]  # tab20 + tab20b + tab20c, cycled, as in the old ileum.h5ad


class _Window(io.RawIOBase):
    """Read-only seekable view of [start, start+length) of a file."""

    def __init__(self, path: Path, start: int, length: int):
        self._f = open(path, "rb")
        self._start, self._len, self._pos = start, length, 0

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self._pos

    def seek(self, off, whence=0):
        base = {0: 0, 1: self._pos, 2: self._len}[whence]
        self._pos = base + off
        return self._pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self._len - self._pos
        n = max(0, min(n, self._len - self._pos))
        self._f.seek(self._start + self._pos)
        d = self._f.read(n)
        self._pos += len(d)
        return d

    def readinto(self, b):
        d = self.read(len(b))
        b[: len(d)] = d
        return len(d)


def open_h5ad_member(zip_path: Path, index: Path | None):
    import rapidgzip

    zi = zipfile.ZipFile(zip_path).getinfo(MEMBER)
    assert zi.compress_type == zipfile.ZIP_DEFLATED
    with open(zip_path, "rb") as f:
        f.seek(zi.header_offset)
        hdr = struct.unpack("<IHHHHHIIIHH", f.read(30))
        assert hdr[0] == 0x04034B50, "bad local header"
        start = zi.header_offset + 30 + hdr[9] + hdr[10]
    rg = rapidgzip.RapidgzipFile(_Window(zip_path, start, zi.compress_size),
                                 parallelization=os.cpu_count() or 1)
    if index and index.exists():
        rg.import_index(str(index))
    elif index:
        rg.seek(zi.file_size - 1)  # one parallel pass builds the seek index
        rg.export_index(str(index))
        rg.seek(0)
    return h5py.File(rg, "r")


def _strs(a):
    return [x.decode() if isinstance(x, bytes) else str(x) for x in a]


def _cat(grp, sl):
    cats = _strs(grp["categories"][:])
    vals = np.asarray(cats, dtype=object)[grp["codes"][sl]]
    # alphabetical categories, like the old CSV -> AnnData build
    return pd.Categorical(vals, categories=sorted(set(vals)))


def build(f: h5py.File) -> ad.AnnData:
    obs = f["obs"]
    sg = obs["slice_full_name"]
    code = _strs(sg["categories"][:]).index(SLICE)
    rows = np.flatnonzero(sg["codes"][:] == code)
    a, b = int(rows[0]), int(rows[-1]) + 1
    assert b - a == rows.size, "slice rows are expected to be contiguous"
    sl = slice(a, b)

    var = _strs(f["var/_index"][:])
    gi = [var.index(g) for g in GENES]
    order = np.argsort(gi)
    X_sorted = f["X"][sl, sorted(gi)]
    X = np.empty_like(X_sorted)
    X[:, order] = X_sorted  # back to GENES order

    df = pd.DataFrame(
        {
            "cell_type": _cat(obs["cell_type"], sl),
            "cell_class": _cat(obs["cell_class"], sl),
            "anatomical_layer": _cat(obs["anatomical_layer"], sl),
            "mucosal_pseudospace": obs["mucosal_pseudospace"][sl].astype(np.float64),
        }
    )
    xy = np.c_[obs["x [μm]"][sl], obs["y [μm]"][sl]].astype(np.float64)
    df.index = [f"c{i}" for i in range(len(df))]
    adata = ad.AnnData(
        X=np.ascontiguousarray(X, dtype=np.float32),
        obs=df,
        var=pd.DataFrame(index=pd.Index(GENES, dtype=str)),
    )
    adata.obsm["spatial"] = xy
    n = len(adata.obs["cell_type"].cat.categories)
    adata.uns["cell_type_colors"] = np.array(
        [PALETTE60[i % len(PALETTE60)] for i in range(n)], dtype=object
    )
    return adata


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--zip", type=Path, required=True, help="Path to Dryad data_upload.zip")
    p.add_argument("--out", type=Path, default=Path("ileum.h5ad"))
    p.add_argument("--index", type=Path, default=None,
                   help="Optional rapidgzip seek-index cache (~390 MB); built if missing")
    args = p.parse_args()

    f = open_h5ad_member(args.zip, args.index)
    adata = build(f)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    adata.write_h5ad(args.out, compression="gzip")
    nbytes = args.out.stat().st_size
    print(f"Wrote {args.out} ({nbytes:,} B) n_obs={adata.n_obs} n_vars={adata.n_vars} "
          f"slice={SLICE}", flush=True)
    if nbytes > 10_000_000:
        raise SystemExit(f"{args.out} is {nbytes:,} B; keep it at or under 10 MB")
    sys.stdout.flush()
    os._exit(0)  # rapidgzip worker threads can abort at interpreter teardown


if __name__ == "__main__":
    main()
