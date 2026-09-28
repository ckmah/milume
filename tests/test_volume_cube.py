"""Toy OME-Zarr fixture and loopback server for VolumeCubeWidget."""

import json

import numpy as np
import pytest
from urllib.request import urlopen

from spatial_rx.volume_cube import (
    BLIN_IDR_IMAGE_URL,
    BLIN_SHAPE_ZYX,
    DEFAULT_Z_SLAB,
    TOY_SHAPE_ZYX,
    VolumeCubeWidget,
    cells_in_inspect_window,
    mid_z_slab,
    ome_zarr_level0,
    serve_directory,
    write_toy_ome_zarr,
)


def test_toy_widget_serves_its_image_and_labels(tmp_path):
    widget = VolumeCubeWidget.toy(tmp_path / "toy.ome.zarr")
    try:
        with urlopen(f"{widget.image_url}.zattrs") as resp:
            assert json.loads(resp.read())["multiscales"][0]["name"] == "toy-image"
            assert resp.headers["Access-Control-Allow-Origin"] == "*"
        with urlopen(f"{widget.labels_url}0/.zarray") as resp:
            assert resp.status == 200
        depth, height, width = TOY_SHAPE_ZYX
        assert (widget.window_cx, widget.window_cy) == (width / 2, height / 2)
        assert widget.slice_z_max == depth
    finally:
        widget._server.shutdown()


def test_from_ome_zarr_reads_an_ngff_04_store_in_unit_voxels(tmp_path):
    root = write_toy_ome_zarr(tmp_path / "toy.ome.zarr")
    widget = VolumeCubeWidget.from_ome_zarr(root)
    try:
        assert widget.voxel_size_um == [1.0, 1.0, 1.0]
        assert widget.origin_um == [0.0, 0.0, 0.0]
        assert widget.slice_x_max == TOY_SHAPE_ZYX[2]
    finally:
        widget._server.shutdown()


def test_from_url_centres_the_window_on_a_mid_z_slab():
    widget = VolumeCubeWidget.from_url(
        BLIN_IDR_IMAGE_URL,
        labels_url="",
        shape_zyx=BLIN_SHAPE_ZYX,
        contrast_limits=(110, 255),
    )
    depth, height, width = BLIN_SHAPE_ZYX
    assert widget.image_url == BLIN_IDR_IMAGE_URL
    assert widget.labels_url == ""
    assert widget.slice_x_max == float(width)
    assert widget.slice_y_max == float(height)
    assert widget.window_cx == width / 2
    assert widget.window_cy == height / 2
    z_min, z_max = mid_z_slab(depth, DEFAULT_Z_SLAB)
    assert (widget.slice_z_min, widget.slice_z_max) == (z_min, z_max)
    assert widget.contrast_limits == [110.0, 255.0]


def test_coord_contract_landmarks_cube_xy():
    """Landmarks spatial XY and cube window traits share the same voxel frame."""
    depth, height, width = BLIN_SHAPE_ZYX
    cube = VolumeCubeWidget.from_url(
        "http://example.test/vol.zarr",
        shape_zyx=BLIN_SHAPE_ZYX,
    )
    cx, cy = 120.0, 140.0
    spatial = np.array([[cx, cy], [width + 10, cy], [cx, height + 10]])
    mask = cells_in_inspect_window(spatial, cx, cy, cube.window_size_um)
    assert mask.tolist() == [True, False, False]
    half = cube.window_size_um / 2
    assert cube.slice_x_min <= cx - half
    assert cube.slice_x_max >= cx + half
    assert cube.slice_y_min <= cy - half
    assert cube.slice_y_max >= cy + half
    assert cube.slice_z_max - cube.slice_z_min == DEFAULT_Z_SLAB


def _fetch(url, range_header=None):
    from urllib.error import HTTPError
    from urllib.request import Request

    request = Request(url, headers={"Range": range_header} if range_header else {})
    try:
        with urlopen(request) as resp:
            return resp.status, resp.headers, resp.read()
    except HTTPError as err:
        return err.code, err.headers, b""


def test_serve_directory_answers_range_requests(tmp_path):
    """Zarr v3 shards are read by range: suffix for the index, then each chunk."""
    payload = bytes(range(256)) * 4
    (tmp_path / "shard").write_bytes(payload)
    server, base = serve_directory(tmp_path)
    url = f"{base}/shard"
    try:
        status, headers, body = _fetch(url, "bytes=10-19")
        assert (status, body) == (206, payload[10:20])
        assert headers["Content-Range"] == f"bytes 10-19/{len(payload)}"
        assert _fetch(url, "bytes=-5")[::2] == (206, payload[-5:])
        assert _fetch(url, "bytes=1020-")[::2] == (206, payload[1020:])
        assert _fetch(url, "bytes=5000-")[0] == 416
        status, headers, body = _fetch(url)
        assert (status, body) == (200, payload)
        assert headers["Accept-Ranges"] == "bytes"
        assert "Range" in headers["Access-Control-Allow-Headers"]
    finally:
        server.shutdown()


def test_serve_directory_never_lists_directories(tmp_path):
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "f").write_bytes(b"x")
    server, base = serve_directory(tmp_path)
    try:
        assert _fetch(f"{base}/sub/f")[::2] == (200, b"x")
        for url in (f"{base}/", f"{base}/sub", f"{base}/sub/"):
            assert _fetch(url)[0] == 404, url
    finally:
        server.shutdown()


def test_serve_directory_refuses_paths_outside_the_allowlist(tmp_path):
    for rel in ("images/a/zarr.json", "images/ab/zarr.json", "tables/t/zarr.json", "zarr.json"):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_bytes(b"{}")
    server, base = serve_directory(tmp_path, allow_prefixes=("images/a/",))
    try:
        assert _fetch(f"{base}/images/a/zarr.json")[0] == 200
        assert _fetch(f"{base}/images/a/zarr.json", "bytes=0-0")[0] == 206
        for rel in ("images/ab/zarr.json", "tables/t/zarr.json", "zarr.json", "images/a/../../zarr.json"):
            assert _fetch(f"{base}/{rel}")[0] == 404, rel
            assert _fetch(f"{base}/{rel}", "bytes=0-0")[0] == 404, rel
    finally:
        server.shutdown()


def _write_ngff05(root, shape_tczyx, scale, translation):
    """Minimal NGFF 0.5 / Zarr v3 image shaped like Meteor's mosaic_3d."""
    import zarr

    group = zarr.open_group(str(root), mode="w", zarr_format=3)
    group.create_array("scale0/image", shape=shape_tczyx, chunks=(1, 1, 4, 16, 16), dtype="uint8")
    axes = [{"name": n, "type": t} for n, t in zip("tczyx", ["time", "channel", "space", "space", "space"])]
    group.attrs["ome"] = {
        "version": "0.5",
        "multiscales": [
            {
                "axes": axes,
                "datasets": [
                    {
                        "path": "scale0/image",
                        "coordinateTransformations": [
                            {"type": "scale", "scale": scale},
                            {"type": "translation", "translation": translation},
                        ],
                    }
                ],
            }
        ],
    }


def test_from_ome_zarr_frames_cube_in_store_microns(tmp_path):
    """Meteor mosaics are georeferenced in stage microns; cells use the same frame."""
    root = tmp_path / "mosaic_3d.ome.zarr"
    _write_ngff05(
        root,
        (1, 1, 8, 64, 96),
        [1.0, 1.0, 0.5, 0.45, 0.45],
        [0.0, 0.0, -6.0, -1114.0, -2686.0],
    )
    widget = VolumeCubeWidget.from_ome_zarr(root, contrast_limits=(10, 200))
    try:
        assert widget.voxel_size_um == [0.5, 0.45, 0.45]
        assert widget.origin_um == [-6.0, -1114.0, -2686.0]
        assert widget.window_cx == -2686.0 + 96 * 0.45 / 2
        assert widget.window_cy == -1114.0 + 64 * 0.45 / 2
        assert widget.slice_z_min == -6.0
        assert widget.slice_z_max == -6.0 + 8 * 0.5
        assert widget.contrast_limits == [10.0, 200.0]
        status, _, body = _fetch(f"{widget.image_url}zarr.json")
        assert status == 200 and json.loads(body)["attributes"]["ome"]["version"] == "0.5"
    finally:
        widget._server.shutdown()


def test_from_ome_zarr_serves_labels_on_the_same_grid(tmp_path):
    image = tmp_path / "mosaic_3d.ome.zarr"
    labels = tmp_path / "cell_labels"
    frame = ([1.0, 1.0, 0.5, 0.45, 0.45], [0.0, 0.0, -6.0, -1114.0, -2686.0])
    _write_ngff05(image, (1, 1, 8, 64, 96), *frame)
    _write_ngff05(labels, (1, 1, 8, 64, 96), *frame)
    widget = VolumeCubeWidget.from_ome_zarr(image, labels_path=labels)
    try:
        assert widget.labels_url.startswith("http://127.0.0.1:")
        assert widget.labels_url != widget.image_url
        status, _, body = _fetch(f"{widget.labels_url}zarr.json")
        assert status == 200 and json.loads(body)["attributes"]["ome"]["version"] == "0.5"
    finally:
        widget._server.shutdown()
        widget._labels_server.shutdown()


def test_from_ome_zarr_rejects_labels_on_another_grid(tmp_path):
    image = tmp_path / "mosaic_3d.ome.zarr"
    labels = tmp_path / "cell_labels"
    frame = ([1.0, 1.0, 0.5, 0.45, 0.45], [0.0, 0.0, 0.0, 0.0, 0.0])
    _write_ngff05(image, (1, 1, 8, 64, 96), *frame)
    _write_ngff05(labels, (1, 1, 8, 32, 48), *frame)
    with pytest.raises(ValueError, match="differs from the image"):
        VolumeCubeWidget.from_ome_zarr(image, labels_path=labels)


def test_reads_the_frame_from_a_spatialdata_sequence_transform(tmp_path):
    """SpatialData stores a Labels3DModel's scale + translation as one sequence."""
    root = tmp_path / "cell_labels"
    _write_ngff05(root, (1, 1, 8, 64, 96), [1.0] * 5, [0.0] * 5)
    import zarr

    group = zarr.open_group(str(root), mode="r+")
    ome = dict(group.attrs["ome"])
    ome["multiscales"][0]["coordinateTransformations"] = [
        {
            "type": "sequence",
            "transformations": [
                {"type": "scale", "scale": [1.0, 1.0, 0.5, 0.45, 0.45]},
                {"type": "translation", "translation": [0.0, 0.0, -6.0, -1114.0, -2686.0]},
            ],
        }
    ]
    group.attrs["ome"] = ome
    meta = ome_zarr_level0(root)
    assert meta["voxel_size_um"] == (0.5, 0.45, 0.45)
    assert meta["origin_um"] == (-6.0, -1114.0, -2686.0)


def test_highlight_cells_sets_coloured_groups_and_clears():
    w = VolumeCubeWidget()
    w.highlight_cells({"T cell": [3, 4], "B cell": np.array([7]), "empty": []}, {"T cell": "#ff0000"})
    t_cell, b_cell = w.highlight_groups  # empty groups are dropped
    assert t_cell == {"name": "T cell", "color": "#ff0000", "labels": [3, 4]}
    assert b_cell["name"] == "B cell" and b_cell["labels"] == [7]
    assert b_cell["color"].startswith("#") and b_cell["color"] != "#ff0000"
    w.highlight_cells({})
    assert w.highlight_groups == []


def test_serve_directory_takes_a_burst_of_parallel_reads(tmp_path):
    """The cube fetches many chunks at once; none may be refused (Windows backlog 5)."""
    import threading
    from concurrent.futures import ThreadPoolExecutor

    n = 64
    for i in range(n):
        (tmp_path / f"c{i}").write_bytes(bytes([i]) * 4096)
    server, base = serve_directory(tmp_path)
    start = threading.Barrier(n)

    def get(i):
        start.wait()
        with urlopen(f"{base}/c{i}", timeout=30) as resp:
            return resp.status, resp.read()

    try:
        with ThreadPoolExecutor(n) as pool:
            results = list(pool.map(get, range(n)))
        assert [status for status, _ in results] == [200] * n
        assert all(body == bytes([i]) * 4096 for i, (_, body) in enumerate(results))
    finally:
        server.shutdown()
