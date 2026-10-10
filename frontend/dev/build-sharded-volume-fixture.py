#!/usr/bin/env python3
"""Copy the toy SpatialData store and reshard image/label pyramids for URL-mode e2e."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import zarr  # noqa: E402

DEV = Path(__file__).resolve().parent
PUBLIC = DEV / "landmarks-volume" / "public"
SOURCE = PUBLIC / "toy.sdata.zarr"
DEST = PUBLIC / "sharded-toy.sdata.zarr"
FIXTURE_SRC = DEV / "landmarks-volume-fixture.json"
FIXTURE_OUT = DEV / "landmarks-volume-fixture.sharded.http.json"


def _reshard_array(array_path: Path, *, chunks: tuple[int, ...], shards: tuple[int, ...]) -> None:
    arr = zarr.open_array(array_path, mode="r")
    data = arr[...]
    chunk_dir = array_path / "c"
    if chunk_dir.exists():
        shutil.rmtree(chunk_dir)
    zarr.create_array(
        store=array_path,
        shape=arr.shape,
        dtype=arr.dtype,
        chunks=chunks,
        shards=shards,
        zarr_format=3,
        overwrite=True,
    )
    zarr.open_array(array_path, mode="r+")[...] = data


def _reshard_pyramid(element_path: Path) -> None:
    for scale in sorted(element_path.glob("s*")):
        if not scale.is_dir():
            continue
        arr = zarr.open_array(scale, mode="r")
        chunk_shape = tuple(arr.chunks)
        shards = tuple(min(max(c * 2, c), d) for c, d in zip(chunk_shape, arr.shape, strict=False))
        _reshard_array(scale, chunks=chunk_shape, shards=shards)


def main() -> None:
    if DEST.exists():
        shutil.rmtree(DEST)
    shutil.copytree(SOURCE, DEST)
    _reshard_pyramid(DEST / "images" / "mosaic")
    _reshard_pyramid(DEST / "labels" / "cells")

    fixture = json.loads(FIXTURE_SRC.read_text())
    vol = fixture["volume"]
    for key in ("image_url", "labels_url"):
        rel = str(vol.get(key) or "")
        if rel:
            vol[key] = f"/sharded-toy.sdata.zarr/{rel}"
    FIXTURE_OUT.write_text(json.dumps(fixture, indent=2) + "\n")
    shutil.copy2(FIXTURE_OUT, PUBLIC / FIXTURE_OUT.name)
    print(f"wrote {DEST.name} and {FIXTURE_OUT.name}")


if __name__ == "__main__":
    main()
