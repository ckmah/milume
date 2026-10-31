#!/usr/bin/env python3
"""Compare before/after #394 visual PNG pairs."""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow required: uv run --with pillow python ...")
    sys.exit(1)

ROOT = Path("/opt/cursor/artifacts/color-api-394-visual")
MODES = ("categorical", "numeric", "gene-blend", "embedding")


def main() -> None:
    before = ROOT / "before"
    after = ROOT / "after"
    report = {}
    for mode in MODES:
        bp, ap = before / f"{mode}.png", after / f"{mode}.png"
        if not bp.is_file() or not ap.is_file():
            report[mode] = {"error": "missing capture"}
            continue
        im_b, im_a = Image.open(bp).convert("RGBA"), Image.open(ap).convert("RGBA")
        if im_b.size != im_a.size:
            report[mode] = {"diff_pixels": -1, "note": f"size {im_b.size} vs {im_a.size}"}
            continue
        diff = 0
        px_b, px_a = im_b.load(), im_a.load()
        w, h = im_b.size
        for y in range(h):
            for x in range(w):
                if px_b[x, y] != px_a[x, y]:
                    diff += 1
        report[mode] = {
            "diff_pixels": diff,
            "total_pixels": w * h,
            "note": "identical" if diff == 0 else f"{diff} pixels differ",
        }
    out = ROOT / "pixel-diff-report.json"
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out.read_text())


if __name__ == "__main__":
    main()
