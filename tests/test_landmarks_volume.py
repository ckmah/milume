import base64
from unittest.mock import patch

import numpy as np
import pytest

pytest.importorskip("spatialdata")

from milume import LandmarksWidget
from milume.volume_cube import TOY_CONTRAST_LIMITS, toy_volumes
from tests.helpers import toy_spatialdata

NEW_TRAITS = {"volume", "volume_label_ids", "volume_cut"}


@pytest.fixture
def sdata(tmp_path):
    return toy_spatialdata(tmp_path / "toy.zarr")


def test_resolve_volume_normalizes_remote_store_root(sdata):
    import dataclasses

    from milume.volume_source import _normalize_store_url, resolve_volume

    _, src = resolve_volume(sdata)
    assert src is not None
    remote = _normalize_store_url("https://huggingface.co/datasets/Stellaromics/demo/resolve/main/colon_a2.zarr")
    src = dataclasses.replace(src, root=remote)
    assert str(src.root).endswith("/")
    assert str(src.root).startswith("https://")


def test_widget_from_sdata_exposes_comm_volume_urls(sdata):
    with patch("http.server.ThreadingHTTPServer", side_effect=AssertionError("no HTTP server")):
        w = LandmarksWidget(sdata, color="cell_type")
    assert set(w.volume) == {"image_url", "labels_url", "voxel_size_um", "origin_um", "contrast_limits"}
    assert w.volume["voxel_size_um"] == [1.0, 1.0, 1.0]
    assert w.volume["image_url"] == "images/mosaic/"
    assert w.volume["labels_url"] == "labels/cells/"
    meta, buffers = w.volume_get({"path": "images/mosaic/zarr.json"}, [])
    assert meta["ok"] is True and buffers[0]
    ids = np.frombuffer(base64.b64decode(w.volume_label_ids), dtype=np.int32)
    np.testing.assert_array_equal(ids, sdata.tables["table"].obs["cell_id"].to_numpy())
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


def test_widget_comm_serves_only_the_cube_image_and_labels(sdata):
    w = LandmarksWidget(sdata, color="cell_type")
    assert (sdata.path / "tables" / "table" / "zarr.json").is_file()
    ok, _ = w.volume_get({"path": "images/mosaic/zarr.json"}, [])
    assert ok["ok"] is True
    ok, _ = w.volume_get({"path": "labels/cells/zarr.json"}, [])
    assert ok["ok"] is True
    for path in (
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
    assert w.volume == {} and w.volume_label_ids == ""


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
    names = list(w.get_obs_names(w._adata, "inspect-1"))
    assert names == [str(w._obs_names[0]), str(w._obs_names[2])]


def test_contrast_limits_come_from_the_image(sdata):
    image, _ = toy_volumes()
    lo, hi = LandmarksWidget(sdata, color="cell_type").volume["contrast_limits"]
    assert lo == image.min()
    assert TOY_CONTRAST_LIMITS[1] < hi <= image.max()


def test_explicit_contrast_limits_win(sdata):
    w = LandmarksWidget(sdata, color="cell_type", contrast_limits=(5, 900))
    assert w.volume["contrast_limits"] == [5.0, 900.0]
