import numpy as np
import pytest

pytest.importorskip("spatialdata")

from milume import LandmarksWidget
from tests.helpers import toy_spatialdata


@pytest.fixture
def sdata(tmp_path):
    return toy_spatialdata(tmp_path / "toy.zarr")


def test_channels_unknown_raises(sdata):
    with pytest.raises(ValueError, match="unknown channel.*available"):
        LandmarksWidget(sdata, channels=["DAPI"])


def test_channels_single_3d_ok(sdata):
    names = list(LandmarksWidget(sdata).volume["channels"])
    first = names[0]["name"]
    w = LandmarksWidget(sdata, channels=[first])
    visible = [c for c in w.volume["channels"] if c["visible"]]
    assert len(visible) == 1 and visible[0]["name"] == first


def test_channels_two_on_3d_raises(sdata):
    w = LandmarksWidget(sdata)
    names = [c["name"] for c in w.volume["channels"]]
    if len(names) < 2:
        pytest.skip("toy has one channel")
    with pytest.raises(ValueError, match="3D images support one channel"):
        LandmarksWidget(sdata, channels=names[:2])


def test_auto_pick_warning(sdata):
    sdata.images["other"] = sdata.images["mosaic"]
    with pytest.warns(UserWarning, match="picked.*skipped"):
        w = LandmarksWidget(sdata)
    assert w.volume["image_url"] == "images/mosaic/"


def test_z_band_defaults_from_spatial(sdata):
    w = LandmarksWidget(sdata)
    z = np.asarray(sdata.tables["table"].obsm["spatial"][:, 2], dtype=float)
    assert w.z_band_lo_um <= w.z_focus_um <= w.z_band_hi_um
    assert w.z_band_hi_um - w.z_band_lo_um >= 5.0 - 1e-6
    assert w.z_band_lo_um >= z.min() - 1e-6
    assert w.z_band_hi_um <= z.max() + 1e-6
