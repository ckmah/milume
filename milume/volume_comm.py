"""Serve SpatialData image/label zarr keys to the browser over the widget comm."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Literal

RangeSpec = dict[str, int]


def normalize_allow_prefixes(allow_prefixes: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(p.strip("/") + "/" for p in allow_prefixes)


def _allowed(rel: str, allow_prefixes: tuple[str, ...]) -> bool:
    rel = rel.replace(os.sep, "/")
    return any(rel.startswith(prefix) for prefix in allow_prefixes)


def resolve_volume_path(root: Path, rel: str, allow_prefixes: tuple[str, ...]) -> Path | None:
    """Map a store-relative path to a file under ``root``, or None if disallowed."""
    rel = rel.lstrip("/").replace("/", os.sep)
    if not rel or ".." in rel.split(os.sep):
        return None
    if not _allowed(rel, allow_prefixes):
        return None
    path = (root / rel).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError:
        return None
    if path.is_dir():
        return None
    return path


def read_volume_bytes(
    root: Path,
    allow_prefixes: tuple[str, ...],
    rel: str,
    range_spec: RangeSpec | None = None,
) -> tuple[Literal[200, 206, 404], bytes]:
    """Read one file under ``root``; optional byte range for zarr shards."""
    path = resolve_volume_path(root, rel, allow_prefixes)
    if path is None or not path.is_file():
        return 404, b""
    size = path.stat().st_size
    if range_spec is None:
        return 200, path.read_bytes()
    if "suffixLength" in range_spec:
        n = int(range_spec["suffixLength"])
        if n <= 0 or n > size:
            return 404, b""
        start = size - n
        return 206, path.read_bytes()[start:]
    start = int(range_spec.get("offset", 0))
    length = int(range_spec.get("length", 0))
    if length <= 0 or start >= size:
        return 404, b""
    end = min(start + length, size)
    with path.open("rb") as f:
        f.seek(start)
        return 206, f.read(end - start)


def parse_volume_get_msg(msg: Any) -> tuple[str, RangeSpec | None]:
    if not isinstance(msg, dict):
        raise TypeError("volume_get msg must be a dict")
    rel = str(msg.get("path", ""))
    raw_range = msg.get("range")
    if raw_range is None:
        return rel, None
    if not isinstance(raw_range, dict):
        raise TypeError("range must be a dict")
    return rel, raw_range
