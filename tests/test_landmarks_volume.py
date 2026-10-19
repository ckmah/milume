import base64
from unittest.mock import patch

import numpy as np
import pytest

pytest.importorskip("spatialdata")

from milume import LandmarksWidget
from milume.volume_cube import TOY_CONTRAST_LIMITS, toy_volumes
from tests.helpers import toy_spatialdata

NEW_TRAITS = {"volume", "volume_cell_rows", "volume_cut"}


@pytest.fixture
def sdata(tmp_path):
    return toy_spatialdata(tmp_path / "toy.zarr")


def test_widget_from_sdata_exposes_comm_volume_urls(sdata):
    with patch("http.server.ThreadingHTTPServer", side_effect=AssertionError("no HTTP server")):
        w = LandmarksWidget(sdata, color="cell_type")
    assert set(w.volume) == {"image_url", "cells", "voxel_size_um", "origin_um", "contrast_limits"}
    assert w.volume["voxel_size_um"] == [1.0, 1.0, 1.0]
    assert w.volume["image_url"] == "images/mosaic/"
    cells = w.volume["cells"]
    assert cells["url"] == "shapes/cell_polygons/shapes.parquet"
    meta, buffers = w.volume_get({"path": cells["url"]}, [])
    assert meta["ok"] is True and len(buffers[0]) == cells["bytes"]
    rows = np.frombuffer(base64.b64decode(w.volume_cell_rows), dtype=np.int32)
    np.testing.assert_array_equal(rows, np.arange(sdata.tables["table"].n_obs))
    assert w.volume_cut == [0.0, 256.0, 0.0, 256.0, 0.0, 64.0]


def test_issue_113_comm_serves_zarr_without_http_or_bind(sdata):
    """Issue #113: no loopback server; metadata and one chunk over volume_get."""
    with (
        patch("socket.socket.bind", side_effect=AssertionError("socket.bind")),
        patch("http.server.ThreadingHTTPServer", side_effect=AssertionError("ThreadingHTTPServer")),
    ):
        w = LandmarksWidget(sdata, color="cell_type")
    meta, meta_bufs = w.volume_get({"path": "images/mosaic/zarr.json"}, [])
    assert meta["ok"] is True and meta_bufs[0]
    chunk, chunk_bufs = w.volume_get({"path": "images/mosaic/s0/c/0/0/0/0"}, [])
    assert chunk["ok"] is True and chunk_bufs[0]


def test_widget_comm_serves_only_the_cube_image_and_cell_polygons(sdata):
    w = LandmarksWidget(sdata, color="cell_type")
    assert (sdata.path / "tables" / "table" / "zarr.json").is_file()
    ok, _ = w.volume_get({"path": "images/mosaic/zarr.json"}, [])
    assert ok["ok"] is True
    for path in (
        "labels/cells/zarr.json",
        "tables/table/zarr.json",
        "tables/table/X/zarr.json",
        "zarr.json",
        "images/mosaic/../../tables/table/zarr.json",
        "expression/genes/zarr.json",
    ):
        denied, bufs = w.volume_get({"path": path}, [])
        assert denied["ok"] is False and denied["status"] == 404 and not bufs


@pytest.mark.parametrize(
    "range_spec",
    [
        {"suffixLength": -1},
        {"offset": -1, "length": 1},
        {"offset": 0, "length": 0},
        {"offset": 10_000, "length": 1},
    ],
)
def test_volume_get_rejects_bad_ranges(sdata, range_spec):
    w = LandmarksWidget(sdata, color="cell_type")
    meta, bufs = w.volume_get({"path": "images/mosaic/s0/c/0/0/0/0", "range": range_spec}, [])
    assert meta["ok"] is False
    assert meta["status"] in (400, 416)
    assert meta.get("error")
    assert not bufs


def test_volume_get_returns_structured_error_on_internal_failure(sdata):
    w = LandmarksWidget(sdata, color="cell_type")
    with patch("milume.volume_comm.read_volume_bytes", side_effect=RuntimeError("boom")):
        meta, bufs = w.volume_get({"path": "images/mosaic/zarr.json"}, [])
    assert meta == {"ok": False, "status": 500, "error": "boom"}
    assert not bufs


def test_adata_widget_has_empty_volume(sdata):
    w = LandmarksWidget(sdata.tables["table"])
    assert w.volume == {} and w.volume_cell_rows == ""


def test_volume_contract_is_three_synced_traits():
    synced = {n for n, t in LandmarksWidget.class_traits().items() if t.metadata.get("sync")}
    assert NEW_TRAITS <= synced
    assert not {n for n in synced if n.startswith(("volume", "cube_"))} - NEW_TRAITS


def test_inspect_selection_round_trips_through_get_obs_names(sdata):
    w = LandmarksWidget(sdata, color="cell_type")
    w.selections = [
        {"id": "inspect-1", "type": "inspect", "point_indices": [0, 2],
         "window": {"cx": 100.0, "cy": 120.0, "size_um": 80.0, "cut": []}},
    ]
    names = list(w.get_obs_names("inspect-1"))
    assert names == [str(w._obs_names[0]), str(w._obs_names[2])]


def test_contrast_limits_come_from_the_image(sdata):
    image, _ = toy_volumes()
    lo, hi = LandmarksWidget(sdata, color="cell_type").volume["contrast_limits"]
    assert lo == image.min()
    assert TOY_CONTRAST_LIMITS[1] < hi <= image.max()


def test_explicit_contrast_limits_win(sdata):
    w = LandmarksWidget(sdata, color="cell_type", contrast_limits=(5, 900))
    assert w.volume["contrast_limits"] == [5.0, 900.0]


def test_inspect_open_places_window_at_volume_centre(sdata):
    """#215: opening from Python with no window placed uses the volume centre."""
    w = LandmarksWidget(sdata, color="cell_type")
    assert w.inspect_open is False and w.inspect_cx is None
    w.inspect_open = True
    x0, x1, y0, y1 = w.volume_cut[:4]
    assert (w.inspect_cx, w.inspect_cy) == ((x0 + x1) / 2, (y0 + y1) / 2)
    w.inspect_open = False
    assert w.inspect_open is False
    # Closing keeps the window where it was.
    assert w.inspect_cx == (x0 + x1) / 2


def test_inspect_open_keeps_a_placed_window(sdata):
    w = LandmarksWidget(sdata, color="cell_type")
    w.inspect_cx, w.inspect_cy = 70.0, 80.0
    w.inspect_open = True
    assert (w.inspect_cx, w.inspect_cy, w.inspect_open) == (70.0, 80.0, True)


def test_inspect_open_needs_a_volume():
    from tests.helpers import adata_xy

    w = LandmarksWidget(adata_xy(np.arange(5.0), np.arange(5.0)))
    with pytest.raises(ValueError, match="3D image"):
        w.inspect_open = True
    assert w.inspect_open is False and w.inspect_cx is None
    w.inspect_open = False  # closing is always allowed


def test_inspect_open_sends_window_before_open(sdata):
    """The browser sees the window centre in the same or an earlier message than the open."""
    w = LandmarksWidget(sdata, color="cell_type")
    sent: list[dict] = []
    w.send_state = lambda key=None: sent.append(  # type: ignore[method-assign]
        {k: getattr(w, k) for k in ([key] if isinstance(key, str) else (key or []))}
    )
    w.inspect_open = True
    keys = [k for msg in sent for k in msg]
    assert keys.index("inspect_cx") < keys.index("inspect_open")
