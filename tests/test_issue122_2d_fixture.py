def test_issue122_2d_fixture_exports(tmp_path):
    from tests.helpers import issue122_2d_multichannel_spatialdata
    from milume import LandmarksWidget
    from milume.volume_source import resolve_volume
    import numpy as np

    dest = tmp_path / "issue122.zarr"
    sdata = issue122_2d_multichannel_spatialdata(dest)
    _, src = resolve_volume(sdata)
    assert src is not None
    assert "dummy" in src.channel_names
    w = LandmarksWidget(sdata, color="cell_type")
    assert w.volume.get("channels")
    table = sdata.tables["table"]
    mosaic = sdata.images["mosaic"]
    scale0 = mosaic["scale0"].image if hasattr(mosaic, "__getitem__") else mosaic
    dapi = np.asarray(scale0.values[0, 0] if hasattr(scale0, "values") else scale0[0, 0])
    _, sy, sx = 1.0, src.voxel_size_um[1], src.voxel_size_um[2]
    ox, oy = src.origin_um[1], src.origin_um[2]
    for row in table.obsm["spatial"][:8]:
        x_um, y_um = row
        xi = int(round((x_um - ox) / sx))
        yi = int(round((y_um - oy) / sy))
        assert dapi[yi, xi] >= 80, (xi, yi, int(dapi[yi, xi]))
