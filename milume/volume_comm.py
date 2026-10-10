"""Serve SpatialData image/label zarr keys to the browser over the widget comm."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Callable, Literal
from urllib.error import HTTPError
from urllib.request import Request, urlopen

RangeSpec = dict[str, int]


class VolumeReadError(Exception):
    """Client-visible read failure (bad range, not found, etc.)."""

    def __init__(self, status: int, message: str) -> None:
        self.status = status
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class VolumeReadOutcome:
    ok: bool
    status: Literal[200, 206, 400, 404, 416, 500]
    data: bytes = b""
    error: str | None = None


def normalize_allow_prefixes(allow_prefixes: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(p.strip("/") + "/" for p in allow_prefixes)


def _allowed(rel: str, allow_prefixes: tuple[str, ...]) -> bool:
    rel = rel.replace(os.sep, "/")
    return any(rel.startswith(prefix) for prefix in allow_prefixes)


def _resolved_allow_roots(root: Path, allow_prefixes: tuple[str, ...]) -> tuple[Path, ...]:
    roots: list[Path] = []
    for prefix in allow_prefixes:
        anchor = (root / prefix.rstrip("/")).resolve(strict=False)
        try:
            roots.append(anchor.resolve(strict=True))
        except OSError:
            roots.append(anchor)
    return tuple(roots)


def resolve_volume_path(root: Path, rel: str, allow_prefixes: tuple[str, ...]) -> Path | None:
    """Map a store-relative path to a file under ``root``, or None if disallowed."""
    rel = rel.lstrip("/").replace("/", os.sep)
    if not rel or ".." in rel.split(os.sep):
        return None
    if not _allowed(rel.replace(os.sep, "/"), allow_prefixes):
        return None
    logical = root / rel
    if not logical.exists():
        return None
    try:
        real = os.path.realpath(logical)
        real_path = Path(real)
    except OSError:
        return None
    if not real_path.is_file():
        return None
    for anchor in _resolved_allow_roots(root, allow_prefixes):
        try:
            real_path.relative_to(anchor)
            return real_path
        except ValueError:
            continue
    return None


def _coerce_range_int(name: str, value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise VolumeReadError(400, f"{name} must be an integer")
    return value


def _read_file_range(f: BinaryIO, size: int, range_spec: RangeSpec) -> bytes:
    if "suffixLength" in range_spec:
        if "offset" in range_spec or "length" in range_spec:
            raise VolumeReadError(400, "range cannot mix suffixLength with offset/length")
        n = _coerce_range_int("suffixLength", range_spec["suffixLength"])
        if n <= 0:
            raise VolumeReadError(400, "suffixLength must be positive")
        if n > size:
            raise VolumeReadError(416, "suffixLength beyond end of file")
        f.seek(size - n)
        data = f.read(n)
        if len(data) != n:
            raise VolumeReadError(500, "short read")
        return data
    if "suffixLength" not in range_spec and ("offset" not in range_spec or "length" not in range_spec):
        raise VolumeReadError(400, "range requires suffixLength or offset and length")
    start = _coerce_range_int("offset", range_spec["offset"])
    length = _coerce_range_int("length", range_spec["length"])
    if start < 0:
        raise VolumeReadError(400, "offset must be non-negative")
    if length <= 0:
        raise VolumeReadError(400, "length must be positive")
    if start >= size:
        raise VolumeReadError(416, "offset beyond end of file")
    if length > size:
        raise VolumeReadError(416, "length larger than file")
    available = size - start
    to_read = min(length, available)
    if to_read <= 0:
        raise VolumeReadError(416, "offset beyond end of file")
    f.seek(start)
    data = f.read(to_read)
    if len(data) != to_read:
        raise VolumeReadError(500, "short read")
    return data


def _http_object_url(root: str, rel: str) -> str:
    base = root if root.endswith("/") else f"{root}/"
    return f"{base}{rel.lstrip('/')}"


def _read_http_range(url: str, range_spec: RangeSpec | None) -> VolumeReadOutcome:
    headers: dict[str, str] = {}
    if range_spec is not None:
        if "suffixLength" in range_spec:
            headers["Range"] = f"bytes=-{range_spec['suffixLength']}"
        else:
            start = range_spec["offset"]
            end = start + range_spec["length"] - 1
            headers["Range"] = f"bytes={start}-{end}"
    request = Request(url, headers=headers)
    try:
        with urlopen(request) as resp:
            data = resp.read()
            status = 206 if range_spec is not None else 200
            return VolumeReadOutcome(ok=True, status=status, data=data)
    except HTTPError as exc:
        if exc.code == 404:
            return VolumeReadOutcome(ok=False, status=404, error="not found")
        if exc.code == 416:
            return VolumeReadOutcome(ok=False, status=416, error="range not satisfiable")
        return VolumeReadOutcome(ok=False, status=exc.code, error=str(exc.reason))
    except OSError as exc:
        return VolumeReadOutcome(ok=False, status=500, error=str(exc))


def read_volume_bytes(
    root: Path | str,
    allow_prefixes: tuple[str, ...],
    rel: str,
    range_spec: RangeSpec | None = None,
    *,
    _open: Callable[..., BinaryIO] | None = None,
) -> VolumeReadOutcome:
    """Read one file under ``root``; optional byte range for zarr shards."""
    if isinstance(root, str) and root.startswith(("http://", "https://")):
        rel_norm = rel.lstrip("/").replace("/", os.sep)
        if not rel_norm or ".." in rel_norm.split(os.sep):
            return VolumeReadOutcome(ok=False, status=404, error="not found")
        if not _allowed(rel_norm.replace(os.sep, "/"), allow_prefixes):
            return VolumeReadOutcome(ok=False, status=404, error="not found")
        if range_spec is not None:
            try:
                if "suffixLength" in range_spec:
                    n = _coerce_range_int("suffixLength", range_spec["suffixLength"])
                    if n <= 0:
                        raise VolumeReadError(400, "suffixLength must be positive")
                elif "offset" in range_spec and "length" in range_spec:
                    start = _coerce_range_int("offset", range_spec["offset"])
                    length = _coerce_range_int("length", range_spec["length"])
                    if start < 0:
                        raise VolumeReadError(400, "offset must be non-negative")
                    if length <= 0:
                        raise VolumeReadError(400, "length must be positive")
                else:
                    raise VolumeReadError(400, "range requires suffixLength or offset and length")
            except VolumeReadError as exc:
                return VolumeReadOutcome(ok=False, status=exc.status, error=exc.message)
        return _read_http_range(_http_object_url(root, rel_norm.replace(os.sep, "/")), range_spec)

    opener = _open or Path.open
    path = resolve_volume_path(root, rel, allow_prefixes)
    if path is None:
        return VolumeReadOutcome(ok=False, status=404, error="not found")
    try:
        size = path.stat().st_size
        if range_spec is None:
            with opener(path, "rb") as f:
                data = f.read()
            return VolumeReadOutcome(ok=True, status=200, data=data)
        with opener(path, "rb") as f:
            data = _read_file_range(f, size, range_spec)
        return VolumeReadOutcome(ok=True, status=206, data=data)
    except VolumeReadError as exc:
        return VolumeReadOutcome(ok=False, status=exc.status, error=exc.message)
    except OSError as exc:
        return VolumeReadOutcome(ok=False, status=500, error=str(exc))


def parse_volume_get_msg(msg: Any) -> tuple[str, RangeSpec | None]:
    if not isinstance(msg, dict):
        raise VolumeReadError(400, "volume_get msg must be a dict")
    rel = str(msg.get("path", ""))
    raw_range = msg.get("range")
    if raw_range is None:
        return rel, None
    if not isinstance(raw_range, dict):
        raise VolumeReadError(400, "range must be a dict")
    return rel, raw_range
