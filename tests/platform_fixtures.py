"""Tiny Xenium / CosMx fixtures for #103 (see tests/data/README.md).

- CosMx: committed flat files in tests/data/cosmx_lung5_tiny (no network).
- Xenium: 10x ``Xenium_V1_Human_Ovary_tiny`` (28 MB zip), downloaded on first use,
  sha256-checked and cached under ``$MILUME_TEST_DATA`` (default
  ``~/.cache/milume-test-data``). Set ``MILUME_OFFLINE=1`` to skip instead of
  downloading.
"""

from __future__ import annotations

import hashlib
import os
import urllib.request
import zipfile
from pathlib import Path

import pytest

DATA = Path(__file__).parent / "data"
COSMX_DIR = DATA / "cosmx_lung5_tiny"

XENIUM_URL = (
    "https://cf.10xgenomics.com/samples/xenium/4.0.0/"
    "Xenium_V1_Human_Ovary_tiny/Xenium_V1_Human_Ovary_tiny_outs.zip"
)
XENIUM_SHA256 = "72b9a6d73ec428dd823e9a0d1e3b70d6f0538ec79f67fa7591f034af0894c764"


def cache_dir() -> Path:
    d = Path(
        os.environ.get("MILUME_TEST_DATA", Path.home() / ".cache" / "milume-test-data")
    )
    d.mkdir(parents=True, exist_ok=True)
    return d


def xenium_ovary_tiny_dir() -> Path:
    """Unzipped Xenium outs dir; downloads once (skips test if offline)."""
    root = cache_dir()
    out = root / "Xenium_V1_Human_Ovary_tiny"
    if (out / "experiment.xenium").exists():
        return out
    if os.environ.get("MILUME_OFFLINE"):
        pytest.skip("MILUME_OFFLINE set and Xenium fixture not cached")
    zpath = root / "Xenium_V1_Human_Ovary_tiny_outs.zip"
    if not zpath.exists():
        try:
            tmp = zpath.with_suffix(".part")
            req = urllib.request.Request(XENIUM_URL, headers={"User-Agent": "curl/8"})
            with urllib.request.urlopen(req) as r, open(tmp, "wb") as fh:
                fh.write(r.read())
            tmp.rename(zpath)
        except OSError as e:  # pragma: no cover - network
            pytest.skip(f"could not download Xenium fixture: {e}")
    digest = hashlib.sha256(zpath.read_bytes()).hexdigest()
    if digest != XENIUM_SHA256:
        zpath.unlink()
        raise RuntimeError(f"Xenium fixture checksum mismatch: {digest}")
    with zipfile.ZipFile(zpath) as z:
        z.extractall(out)
    return out


def read_xenium():
    sio = pytest.importorskip("spatialdata_io")
    return sio.xenium(xenium_ovary_tiny_dir())


def read_cosmx():
    sio = pytest.importorskip("spatialdata_io")
    return sio.cosmx(COSMX_DIR, dataset_id="Lung5_Rep2_tiny", transcripts=True)
