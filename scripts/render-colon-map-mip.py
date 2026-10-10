#!/usr/bin/env python3
"""Render a Z-max MIP of the colon A2 mosaic for map backdrop (hero screenshots)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from milume.volume_source import image_contrast_limits  # noqa: E402


def main() -> None:
    import spatialdata as sd
    from PIL import Image

    store = ROOT / "frontend/dev/landmarks-volume/public/colon_a2.sdata.zarr"
    if not store.is_dir():
        raise SystemExit(f"missing {store}; run scripts/export-colon-a2-volume-hero.py first")

    sdata = sd.read_zarr(store)
    image_key = next(iter(sdata.images))
    element = sdata.images[image_key]
    lo, hi = image_contrast_limits(element)

    # Coarsest pyramid level for a lightweight backdrop.
    if hasattr(element, "children"):
        level_key = sorted(element.children.keys(), key=lambda k: int(k.replace("scale", "") or 0))[-1]
        arr = next(iter(element[level_key].values()))
    else:
        arr = element
    if "c" in arr.dims:
        arr = arr.isel(c=0)
    data = np.asarray(arr.data, dtype=np.float32)
    if data.ndim != 3:
        raise SystemExit(f"expected ZYX, got {data.shape}")
    mip = np.nanmax(data, axis=0)
    mip = np.clip((mip - lo) / max(hi - lo, 1e-6), 0, 1)
    gray = (mip * 255).astype(np.uint8)

    out = ROOT / "frontend/dev/landmarks-volume/public/colon-map-mip.png"
    Image.fromarray(gray, mode="L").save(out, optimize=True)
    print(f"wrote {out} ({gray.shape[1]}x{gray.shape[0]} px)")


if __name__ == "__main__":
    main()
