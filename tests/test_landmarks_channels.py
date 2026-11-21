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


def test_channel_alpha_round_trip_is_per_layer(tmp_path):
    pytest.importorskip("spatialdata")
    from milume import LandmarksWidget
    from tests.helpers import issue395_3d_multichannel_spatialdata

    sdata = issue395_3d_multichannel_spatialdata(tmp_path / "mc-alpha.zarr")
    w = LandmarksWidget(sdata, channels=["DAPI", "PanCK"])
    trait = {c["name"]: c["alpha"] for c in w._image_channels}
    assert trait == {"DAPI": 0.55, "PanCK": 0.55}
    assert all("alpha" not in c for c in w.volume["channels"])

    rows = []
    for entry in w._image_channels:
        row = dict(entry)
        if row["name"] == "DAPI":
            row["alpha"] = 0.15
        rows.append(row)
    w._image_channels = rows
    got = {c["name"]: c["alpha"] for c in w._image_channels}
    assert got == {"DAPI": 0.15, "PanCK": 0.55}


def test_channels_two_on_3d_ok(tmp_path):
    pytest.importorskip("spatialdata")
    from milume import LandmarksWidget
    from tests.helpers import issue395_3d_multichannel_spatialdata

    dest = tmp_path / "mc.zarr"
    sdata = issue395_3d_multichannel_spatialdata(dest)
    w = LandmarksWidget(sdata, channels=["DAPI", "PanCK"])
    visible = [c for c in w._image_channels if c["visible"]]
    assert len(visible) == 2


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
