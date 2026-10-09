"""LandmarksWidget on real Xenium / CosMx fixtures (#103, tests/platform_fixtures.py)."""

from __future__ import annotations

import warnings

import numpy as np
import pytest

pytest.importorskip("spatialdata")
pytest.importorskip("spatialdata_io")

from milume import LandmarksWidget
from milume.volume_source import resolve_volume
from tests.platform_fixtures import read_cosmx, read_xenium


@pytest.fixture(scope="module")
def cosmx_sdata():
    return read_cosmx()


@pytest.fixture(scope="module")
def xenium_sdata():
    return read_xenium()


def test_cosmx_default_spatial_piles_fovs(cosmx_sdata):
    t = cosmx_sdata.tables["table"]
    spatial = t.obsm["spatial"]
    global_ = t.obsm["global"]
    spread_local = float(np.ptp(spatial[:, 0]) + np.ptp(spatial[:, 1]))
    spread_global = float(np.ptp(global_[:, 0]) + np.ptp(global_[:, 1]))
    assert spread_global > spread_local * 2


def test_cosmx_widget_requires_global_key(cosmx_sdata):
    t = cosmx_sdata.tables["table"]
    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    assert w._data_x.shape[0] == 218
    np.testing.assert_allclose(w._data_x, t.obsm["global"][:, 0], rtol=0, atol=1e-6)
    assert w.raster_bin_size > 8.0


def test_cosmx_integer_obsm_spatial_numpy2(cosmx_sdata):
    """CosMx table keeps int64 local coords; widget must not use copy=False."""
    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    assert w._data_x.shape[0] == 218


def test_cosmx_no_noisy_missing_cube_warning(cosmx_sdata):
    with warnings.catch_warnings(record=True) as rec:
        warnings.simplefilter("always")
        LandmarksWidget(cosmx_sdata, spatial_key="global")
    assert not any("no 3D image" in str(w.message) for w in rec)


def test_cosmx_get_obs_names_without_passing_adata(cosmx_sdata):
    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    names = w.get_obs_names(selection_id="all")
    t = cosmx_sdata.tables["table"]
    assert len(names) == 218
    assert set(names) == set(t.obs_names.astype(str))


def test_xenium_widget_loads_real_ovary_tiny(xenium_sdata):
    w = LandmarksWidget(xenium_sdata)
    assert w._data_x.shape[0] == 632
    t = xenium_sdata.tables["table"]
    np.testing.assert_allclose(w._data_x, t.obsm["spatial"][:, 0], rtol=0, atol=1e-3)
    assert w.raster_bin_size > 0


def test_xenium_2d_morphology_no_keyerror_z(xenium_sdata):
    _, vol = resolve_volume(xenium_sdata)
    assert vol is None
    LandmarksWidget(xenium_sdata)
