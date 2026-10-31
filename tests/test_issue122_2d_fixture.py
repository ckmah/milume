def test_issue122_2d_fixture_exports(tmp_path):
    from tests.helpers import issue122_2d_multichannel_spatialdata
    from milume import LandmarksWidget
    from milume.volume_source import resolve_volume

    dest = tmp_path / "issue122.zarr"
    sdata = issue122_2d_multichannel_spatialdata(dest)
    _, src = resolve_volume(sdata)
    assert src is not None
    assert src.is_3d is True
    assert "dummy" in src.channel_names
    w = LandmarksWidget(sdata, color="cell_type")
    assert w.volume.get("channels")
