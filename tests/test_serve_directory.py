"""Loopback server that feeds the Landmarks inspect cube."""

from urllib.request import urlopen

from milume.volume_cube import serve_directory


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
