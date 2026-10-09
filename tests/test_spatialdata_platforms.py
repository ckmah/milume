"""LandmarksWidget on Xenium- and CosMx-shaped SpatialData (issue #103)."""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("spatialdata")

spatialdata_io = pytest.importorskip("spatialdata_io")

from milume import LandmarksWidget
from milume.volume_source import resolve_volume
from tests.fixtures.spatialdata_platforms import (
    write_cosmx_tiny_flatfiles,
    xenium_like_spatialdata,
    xenium_like_with_string_instance_ids,
)


@pytest.fixture
def cosmx_dir(tmp_path):
    return write_cosmx_tiny_flatfiles(tmp_path / "cosmx")


@pytest.fixture
def cosmx_sdata(cosmx_dir):
    return spatialdata_io.cosmx(cosmx_dir, dataset_id="milume_tiny", transcripts=False)


def test_cosmx_global_positions_separate_fovs(cosmx_sdata):
    t = cosmx_sdata.tables[list(cosmx_sdata.tables)[0]]
    spatial = t.obsm["spatial"]
    global_ = t.obsm["global"]
    # Local FOV coords repeat; global coords do not.
    assert np.allclose(spatial[:3], spatial[3:6])
    assert not np.allclose(global_[:3, 0], global_[3:6, 0])
    assert np.allclose(global_[:3, 0], [5100, 5200, 5300])
    assert np.allclose(global_[3:6, 0], [10100, 10200, 10300])


def test_cosmx_widget_uses_global_key(cosmx_sdata):
    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    t = cosmx_sdata.tables[list(cosmx_sdata.tables)[0]]
    np.testing.assert_allclose(w._data_x, t.obsm["global"][:, 0])
    assert w.raster_bin_size > 50


def test_cosmx_integer_obsm_coords(cosmx_sdata):
    t = cosmx_sdata.tables[list(cosmx_sdata.tables)[0]]
    t.obsm["global"] = np.round(t.obsm["global"]).astype(np.int64)
    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    assert w._data_x.shape[0] == t.n_obs


def test_xenium_like_2d_labels_do_not_raise():
    sdata = xenium_like_spatialdata()
    w = LandmarksWidget(sdata)
    assert w._data_x.shape[0] == sdata.tables["table"].n_obs
    _, vol = resolve_volume(sdata)
    assert vol is None


def test_xenium_like_string_instance_key_skips_label_ids():
    sdata = xenium_like_with_string_instance_ids()
    with warnings.catch_warnings(record=True) as rec:
        warnings.simplefilter("always")
        _, vol = resolve_volume(sdata)
    assert vol is None
    assert not any("instance_key" in str(w.message) for w in rec)


def test_xenium_like_on_disk_zarr_no_cube(tmp_path):
    import spatialdata as sd

    sdata = xenium_like_spatialdata()
    dest = tmp_path / "xenium_like.zarr"
    sdata.write(dest)
    loaded = sd.read_zarr(dest)
    w = LandmarksWidget(loaded)
    assert w.volume == {}


def test_cosmx_get_obs_names_without_passing_adata(cosmx_sdata):
    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    names = w.get_obs_names(selection_id="all")
    t = cosmx_sdata.tables[list(cosmx_sdata.tables)[0]]
    assert list(names) == list(t.obs_names.astype(str))
