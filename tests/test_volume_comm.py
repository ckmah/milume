"""Comm-backed volume reads for the Inspect cube."""

from pathlib import Path

import pytest

from milume.volume_comm import (
    VolumeReadError,
    normalize_allow_prefixes,
    parse_volume_get_msg,
    read_volume_bytes,
    resolve_volume_path,
)


def _tree(tmp_path: Path) -> tuple[Path, tuple[str, ...]]:
    for rel in (
        "images/a/zarr.json",
        "images/a/s0/c/0",
        "labels/cells/zarr.json",
        "tables/t/zarr.json",
        "expression/matrix/zarr.json",
    ):
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"x" * 32 if rel.endswith("/0") else b'{"zarr":3}')
    allow = normalize_allow_prefixes(("images/a/", "labels/cells/"))
    return tmp_path, allow


def test_read_volume_bytes_full_file(tmp_path):
    root, allow = _tree(tmp_path)
    outcome = read_volume_bytes(root, allow, "images/a/zarr.json")
    assert outcome.ok and outcome.status == 200
    assert outcome.data == b'{"zarr":3}'


def test_read_volume_bytes_range_seeks_without_reading_whole_file(tmp_path):
    root, allow = _tree(tmp_path)
    payload = bytes(range(100))
    shard = root / "images/a/shard"
    shard.write_bytes(payload)

    class Tracking:
        def __init__(self, raw: Path):
            self.raw = raw
            self.read_sizes: list[int] = []

        def __call__(self, _path: Path, mode: str = "rb", *args, **kwargs):
            f = self.raw.open(mode, *args, **kwargs)
            tracker = self

            class Wrapped:
                def read(self, n: int = -1) -> bytes:
                    data = f.read(n)
                    tracker.read_sizes.append(len(data))
                    return data

                def seek(self, *a, **kw):
                    return f.seek(*a, **kw)

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    return f.close()

            return Wrapped()

    track = Tracking(shard)

    suffix = read_volume_bytes(
        root,
        allow,
        "images/a/shard",
        {"suffixLength": 5},
        _open=track,
    )
    assert suffix.ok and suffix.data == payload[-5:]
    assert track.read_sizes == [5]

    track.read_sizes.clear()
    span = read_volume_bytes(
        root,
        allow,
        "images/a/shard",
        {"offset": 10, "length": 4},
        _open=track,
    )
    assert span.ok and span.data == payload[10:14]
    assert track.read_sizes == [4]


@pytest.mark.parametrize(
    ("range_spec", "snippet"),
    [
        ({"suffixLength": -1}, "positive"),
        ({"suffixLength": 0}, "positive"),
        ({"suffixLength": 1.5}, "integer"),
        ({"offset": -1, "length": 1}, "non-negative"),
        ({"offset": 0, "length": 0}, "length must be positive"),
        ({"offset": 0, "length": -3}, "length must be positive"),
        ({"offset": 100, "length": 1}, "offset beyond"),
        ({"offset": 90, "length": 20}, "beyond end"),
        ({"suffixLength": 200}, "suffixLength beyond"),
        ({"offset": 0}, "offset and length"),
        ({"length": 4}, "offset and length"),
        ({"suffixLength": 4, "offset": 0, "length": 1}, "mix suffixLength"),
    ],
)
def test_read_volume_bytes_rejects_bad_ranges(tmp_path, range_spec, snippet):
    root, allow = _tree(tmp_path)
    payload = bytes(range(100))
    (root / "images/a/shard").write_bytes(payload)
    outcome = read_volume_bytes(root, allow, "images/a/shard", range_spec)
    assert not outcome.ok
    assert outcome.status in (400, 416)
    assert outcome.error and snippet in outcome.error


def test_read_volume_bytes_missing_and_disallowed(tmp_path):
    root, allow = _tree(tmp_path)
    assert not read_volume_bytes(root, allow, "images/a/missing.json").ok
    assert not read_volume_bytes(root, allow, "tables/t/zarr.json").ok
    assert not read_volume_bytes(root, allow, "expression/matrix/zarr.json").ok
    assert not read_volume_bytes(root, allow, "images/a/../../tables/t/zarr.json").ok
    assert resolve_volume_path(root, "images/a/../b/zarr.json", allow) is None


def test_resolve_volume_path_rejects_symlink_escape(tmp_path):
    root, allow = _tree(tmp_path)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "secret.bin"
    secret.write_bytes(b"LEAKED")
    link = root / "images/a" / "escape"
    link.symlink_to(secret)
    assert resolve_volume_path(root, "images/a/escape", allow) is None
    assert not read_volume_bytes(root, allow, "images/a/escape").ok


def test_parse_volume_get_msg_errors():
    with pytest.raises(VolumeReadError):
        parse_volume_get_msg([])
    with pytest.raises(VolumeReadError):
        parse_volume_get_msg({"path": "x", "range": "bad"})
