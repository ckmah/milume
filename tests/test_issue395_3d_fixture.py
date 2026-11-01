from pathlib import Path


def test_issue395_3d_fixture_size_budget(tmp_path):
    from tests.helpers import issue395_3d_multichannel_spatialdata

    dest = tmp_path / "issue395.zarr"
    issue395_3d_multichannel_spatialdata(dest)
    data_bytes = sum(f.stat().st_size for f in dest.rglob("*") if f.is_file())
    assert data_bytes <= 10 * 1024 * 1024


def test_issue395_widget_two_channels(tmp_path):
    from milume import LandmarksWidget

    from tests.helpers import issue395_3d_multichannel_spatialdata

    dest = tmp_path / "issue395.zarr"
    sdata = issue395_3d_multichannel_spatialdata(dest)
    w = LandmarksWidget(sdata, channels=["DAPI", "PanCK"])
    on = [c for c in w._image_channels if c["visible"]]
    assert [c["name"] for c in on] == ["DAPI", "PanCK"]
    assert len(w.points_data) >= 3
    assert w.volume["is_3d"] is True
