"""Toy volume fixture and optional loopback OME-Zarr server (tests only).

``LandmarksWidget(sdata)`` serves image and label zarr keys over the widget comm
(``volume_get``). ``serve_directory`` remains for unit tests of range reads.
The toy fixture is a small OME-Zarr (1 µm/voxel) used by tests.
"""

from __future__ import annotations

import mimetypes
import os
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import numpy as np

TOY_SHAPE_ZYX = (64, 256, 256)
TOY_CHUNK_ZYX = (32, 64, 64)
TOY_UM_PER_VOXEL = 1.0
TOY_CONTRAST_LIMITS = (0.0, 48.0)

DEFAULT_CONTRAST_LIMITS = (0.0, 48.0)


def toy_volumes() -> tuple[np.ndarray, np.ndarray]:
    """Grayscale image and integer labels. Coordinates are µm (1 µm/voxel)."""
    z, y, x = TOY_SHAPE_ZYX
    image = np.full((z, y, x), 12, dtype=np.uint8)
    labels = np.zeros((z, y, x), dtype=np.uint8)
    zz, yy, xx = np.ogrid[:z, :y, :x]
    blobs = (
        (16, 80, 70, 22, 200, 1),
        (32, 150, 160, 28, 240, 2),
        (48, 190, 100, 18, 160, 3),
    )
    for cz, cy, cx, radius, value, label_id in blobs:
        mask = (zz - cz) ** 2 + (yy - cy) ** 2 + (xx - cx) ** 2 <= radius**2
        image[mask] = value
        labels[mask] = label_id
    return image, labels


_RANGE = re.compile(r"bytes=(\d*)-(\d*)")


class _QuietHandler(SimpleHTTPRequestHandler):
    """Loopback file server with CORS and single-range requests.

    Zarr v3 shards are read by range: the shard index from the end of the file
    (a suffix range, ``bytes=-N``), then each chunk's bytes. The standard
    library handler ignores ``Range`` and would send whole shards.
    """

    _range_remaining: int | None = None
    #: Served paths (relative, "/"-separated, each ending in "/") under which
    #: files may be read; ``None`` serves every file under the directory.
    allow_prefixes: tuple[str, ...] | None = None

    def _allowed(self, path: str) -> bool:
        if self.allow_prefixes is None:
            return True
        rel = os.path.relpath(path, self.directory).replace(os.sep, "/")
        return any(rel.startswith(prefix) for prefix in self.allow_prefixes)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        # A suffix range is not a CORS-safelisted header value, so it preflights.
        self.send_header("Access-Control-Allow-Headers", "Range")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Content-Length")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):  # noqa: ANN201 - stdlib signature
        self._range_remaining = None
        path = self.translate_path(self.path)
        # Files only, inside the allowlist; no directory listings or redirects.
        if os.path.isdir(path) or not self._allowed(path):
            self.send_error(404, "File not found")
            return None
        match = _RANGE.fullmatch((self.headers.get("Range") or "").strip())
        if match is None or match.groups() == ("", "") or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        first, last = match.groups()
        if first == "":
            start, end = max(0, size - int(last)), size - 1
        else:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        if start >= size or end < start:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")  # noqa: SIM115 - the stdlib caller closes it
        f.seek(start)
        self.send_response(206)
        self.send_header(
            "Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream"
        )
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._range_remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile) -> None:  # noqa: ANN001 - stdlib signature
        remaining = self._range_remaining
        if remaining is None:
            super().copyfile(source, outputfile)
            return
        while remaining > 0:
            block = source.read(min(64 * 1024, remaining))
            if not block:
                break
            outputfile.write(block)
            remaining -= len(block)

    def list_directory(self, path):  # noqa: ANN001, ANN201 - stdlib signature
        self.send_error(404, "File not found")
        return None

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        return


class _LoopbackServer(ThreadingHTTPServer):
    """Threaded server with a listen backlog for the cube's parallel chunk reads.

    The stdlib default backlog of 5 overflows when the browser opens dozens of
    chunk requests at once; Windows then refuses the extra connections.
    """

    request_queue_size = 256
    daemon_threads = True


def serve_directory(
    directory: Path, allow_prefixes: tuple[str, ...] | None = None
) -> tuple[ThreadingHTTPServer, str]:
    """Serve the files in ``directory`` on 127.0.0.1. Returns the server and base URL.

    ``allow_prefixes`` (relative paths ending in ``/``, e.g. ``"images/mosaic/"``)
    limits reads to those subtrees; other paths are 404. Directories are never
    listed.
    """
    handler_cls = _QuietHandler
    if allow_prefixes is not None:
        prefixes = tuple(p.strip("/") + "/" for p in allow_prefixes)
        handler_cls = type("_AllowlistHandler", (_QuietHandler,), {"allow_prefixes": prefixes})
    handler = partial(handler_cls, directory=str(directory))
    server = _LoopbackServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address[:2]
    return server, f"http://{host}:{port}"


