"""Committed Xenium / CosMx fixtures for #103 (see tests/data/README.md)."""

from __future__ import annotations

from pathlib import Path

import pytest

DATA = Path(__file__).parent / "data"
XENIUM_DIR = DATA / "xenium_ovary_subsample"
COSMX_DIR = DATA / "cosmx_synthetic_tiny"
COSMX_DATASET_ID = "milume_cosmx_tiny"


def read_xenium():
    sio = pytest.importorskip("spatialdata_io")
    return sio.xenium(
        XENIUM_DIR,
        transcripts=False,
        morphology_mip=False,
        aligned_images=False,
        cells_boundaries=False,
        nucleus_boundaries=False,
    )


def read_cosmx():
    sio = pytest.importorskip("spatialdata_io")
    return sio.cosmx(COSMX_DIR, dataset_id=COSMX_DATASET_ID, transcripts=False)


def read_pyxa(profile: str):
    """Stellaromics/demo Pyxa slice (``xsmall`` or ``small``) via Hugging Face."""
    pytest.importorskip("huggingface_hub")
    from pathlib import Path

    from huggingface_hub import snapshot_download
    from spatialdata_io.experimental import pyxa

    data_dir = (
        Path(
            snapshot_download(
                "Stellaromics/demo",
                repo_type="dataset",
                allow_patterns=f"{profile}/*",
                ignore_patterns="*cell_assigned_gene*",
            )
        )
        / profile
    )
    return pyxa(data_dir, cell_assigned_gene=False, labels=True)
