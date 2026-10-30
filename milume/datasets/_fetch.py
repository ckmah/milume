"""Download helpers for ``milume.datasets`` (stdlib ``urllib`` only)."""

from __future__ import annotations

import hashlib
import os
import urllib.error
import urllib.request
from pathlib import Path

from ._registry import registry_entry


class DatasetChecksumError(ValueError):
    """Raised when a downloaded or cached file fails the pinned sha256."""


def cache_dir() -> Path:
    """Root directory for cached dataset files."""
    if raw := os.environ.get("MILUME_DATA_DIR"):
        return Path(raw).expanduser()
    xdg = os.environ.get("XDG_CACHE_HOME")
    if xdg:
        return Path(xdg).expanduser() / "milume"
    return Path.home() / ".cache" / "milume"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download_to_path(url: str, dest: Path, *, expected_sha256: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    try:
        with urllib.request.urlopen(url) as resp, part.open("wb") as out:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
        observed = _sha256_file(part)
        if observed != expected_sha256.lower():
            raise DatasetChecksumError(
                f"checksum mismatch for {dest.name}: expected {expected_sha256}, got {observed}"
            )
        part.replace(dest)
    except urllib.error.URLError:
        part.unlink(missing_ok=True)
        raise
    except DatasetChecksumError:
        part.unlink(missing_ok=True)
        raise
    except Exception:
        part.unlink(missing_ok=True)
        raise


def _resolve_dest(name: str, path: Path | None) -> Path:
    if path is not None:
        return Path(path).expanduser()
    entry = registry_entry(name)
    return cache_dir() / entry["cache_filename"]


def fetch_file(
    name: str,
    *,
    path: Path | None = None,
    force_download: bool = False,
) -> Path:
    """Return a local path to the dataset file, downloading when needed."""
    entry = registry_entry(name)
    dest = _resolve_dest(name, path)
    expected = entry["sha256"].lower()

    if dest.is_file() and not force_download:
        if _sha256_file(dest) == expected:
            return dest
        dest.unlink()

    _download_to_path(entry["url"], dest, expected_sha256=expected)
    return dest
