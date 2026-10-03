"""Opt-in: Milume on the official SpatialData example datasets.

Set ``MILUME_SDATA_DIR`` to a folder holding one sub-folder per dataset, each
with a ``data.zarr`` (the zips from https://spatialdata.scverse.org/en/stable/tutorials/notebooks/datasets/README.html
unpack to ``data.zarr``). Skipped when unset, so CI needs no downloads.
"""

from __future__ import annotations

import os
import warnings
from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("spatialdata")

ROOT = os.environ.get("MILUME_SDATA_DIR")
DATASETS = sorted(p.parent.name for p in Path(ROOT).glob("*/data.zarr")) if ROOT else []

pytestmark = pytest.mark.skipif(not DATASETS, reason="set MILUME_SDATA_DIR to a folder of <dataset>/data.zarr")


def _read(path: Path):
    import spatialdata as sd

    try:
        return sd.read_zarr(path)
    except Exception:  # noqa: BLE001  # e.g. images without transforms in older exports: tables + shapes suffice in 2D
        return sd.read_zarr(path, selection=("shapes", "tables"))


@pytest.mark.parametrize("name", DATASETS)
def test_peek_opens_the_dataset(name):
    import milume

    sdata = _read(Path(ROOT) / name / "data.zarr")
    kwargs = {"genes": []}  # skip packing a 30k-gene catalog; expression packing has its own tests
    if len(sdata.tables) > 1:
        kwargs["table"] = next(iter(sdata.tables))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)  # multi-coordinate-system notices are expected
        w = milume.peek(sdata, **kwargs)
    assert len(w._adata) > 0
    assert np.isfinite(w._data_x).all() and np.isfinite(w._data_y).all()
    assert w.x_bounds[0] < w.x_bounds[1] and w.y_bounds[0] < w.y_bounds[1]
    w.get_state()  # every trait serialises
