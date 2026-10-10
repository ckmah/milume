"""Comm-backed volume reads for the Inspect cube."""

from pathlib import Path

import pytest

from milume.volume_comm import normalize_allow_prefixes, read_volume_bytes, resolve_volume_path


def _tree(tmp_path: Path) -> tuple[Path, tuple[str, ...]]:
    for rel in (
        "images/a/zarr.json",
        "images/a/s0/c/0",
        "labels/cells/zarr.json",
        "tables/t/zarr.json",
    ):
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"x" * 32 if rel.endswith("/0") else b'{"zarr":3}')
    allow = normalize_allow_prefixes(("images/a/", "labels/cells/"))
    return tmp_path, allow


def test_read_volume_bytes_full_file(tmp_path):
    root, allow = _tree(tmp_path)
    status, body = read_volume_bytes(root, allow, "images/a/zarr.json")
    assert status == 200
    assert body == b'{"zarr":3}'


def test_read_volume_bytes_range(tmp_path):
    root, allow = _tree(tmp_path)
    payload = bytes(range(100))
    (root / "images/a/shard").write_bytes(payload)
    status, body = read_volume_bytes(
        root,
        allow,
        "images/a/shard",
        {"suffixLength": 5},
    )
    assert (status, body) == (206, payload[-5:])
    status, body = read_volume_bytes(root, allow, "images/a/shard", {"offset": 10, "length": 4})
    assert (status, body) == (206, payload[10:14])


def test_read_volume_bytes_missing_and_disallowed(tmp_path):
    root, allow = _tree(tmp_path)
    assert read_volume_bytes(root, allow, "images/a/missing.json")[0] == 404
    assert read_volume_bytes(root, allow, "tables/t/zarr.json")[0] == 404
    assert read_volume_bytes(root, allow, "images/a/../../tables/t/zarr.json")[0] == 404
    assert resolve_volume_path(root, "images/a/../b/zarr.json", allow) is None


def test_landmarks_widget_volume_get_without_http_server(tmp_path):
    pytest.importorskip("spatialdata")
    from unittest.mock import patch

    from milume import LandmarksWidget
    from tests.helpers import toy_spatialdata

    sdata = toy_spatialdata(tmp_path / "toy.zarr")
    with patch("http.server.ThreadingHTTPServer", side_effect=AssertionError("no HTTP server")):
        w = LandmarksWidget(sdata, color="cell_type")
    assert w.volume["image_url"] == "images/mosaic/"
    assert not str(w.volume["image_url"]).startswith("http")

    meta, buffers = w.volume_get({"path": "images/mosaic/zarr.json"}, [])
    assert meta["ok"] is True and buffers[0]
    chunk, chunk_bufs = w.volume_get({"path": "images/mosaic/s0/c/0/0/0/0"}, [])
    assert chunk["ok"] is True and chunk_bufs[0]

    missing, missing_bufs = w.volume_get({"path": "tables/table/zarr.json"}, [])
    assert missing == {"ok": False, "status": 404} and not missing_bufs
