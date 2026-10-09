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
    assert w._data_x.shape[0] == 6
    np.testing.assert_allclose(w._data_x, t.obsm["global"][:, 0], rtol=0, atol=1e-6)
    assert w.raster_bin_size > 8.0


def test_cosmx_integer_obsm_spatial_numpy2(cosmx_sdata):
    """CosMx table keeps int64 local coords; widget must not use copy=False."""
    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    assert w._data_x.shape[0] == 6


def test_cosmx_no_noisy_missing_cube_warning(cosmx_sdata):
    with warnings.catch_warnings(record=True) as rec:
        warnings.simplefilter("always")
        LandmarksWidget(cosmx_sdata, spatial_key="global")
    assert not any("no 3D image" in str(w.message) for w in rec)


def test_cosmx_get_obs_names_without_passing_adata(cosmx_sdata):
    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    names = w.get_obs_names(selection_id="all")
    t = cosmx_sdata.tables["table"]
    assert len(names) == 6
    assert set(names) == set(t.obs_names.astype(str))


def test_cosmx_selection_picks_one_fov_in_global_px(cosmx_sdata):
    t = cosmx_sdata.tables["table"]
    attrs = t.uns["spatialdata_attrs"]
    assert attrs["region_key"] == "fov_labels"
    assert attrs["instance_key"] == "cell_ID"

    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    w.selections = [
        {
            "id": "fov1",
            "type": "rectangle",
            "cx": 5200.0,
            "cy": 400.0,
            "width": 500.0,
            "height": 800.0,
        }
    ]
    picked = set(w.get_obs_names(selection_id="fov1"))
    fov1 = set(t.obs_names[t.obs["fov"].astype(int) == 1].astype(str))
    assert picked == fov1
    assert len(picked) == 3


def test_xenium_selection_matches_spatial_subset(xenium_sdata):
    t = xenium_sdata.tables["table"]
    attrs = t.uns["spatialdata_attrs"]
    assert attrs["region"] == "cell_labels"
    assert attrs["instance_key"] == "cell_labels"

    xy = t.obsm["spatial"]
    xmid = float(np.median(xy[:, 0]))
    ymin, ymax = float(xy[:, 1].min()), float(xy[:, 1].max())

    w = LandmarksWidget(xenium_sdata)
    w.selections = [
        {
            "id": "left_half",
            "type": "polygon",
            "vertices": [
                [float(xy[:, 0].min()) - 5.0, ymin - 5.0],
                [xmid, ymin - 5.0],
                [xmid, ymax + 5.0],
                [float(xy[:, 0].min()) - 5.0, ymax + 5.0],
            ],
        }
    ]
    picked = set(w.get_obs_names(selection_id="left_half"))
    expected = set(t.obs_names[xy[:, 0] < xmid].astype(str))
    assert picked == expected
    assert 100 < len(picked) < t.n_obs


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
