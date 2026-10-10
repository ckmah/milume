#!/usr/bin/env python3
"""Stack v3 vs WebGL rows for designer A/B grid."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/cursor/artifacts/hero-ab")
V3 = Path(sys.argv[2] if len(sys.argv) > 2 else "/opt/cursor/artifacts/v3-frames")
TIMES = [0.6, 3.0, 8.0]
W, H = 1600, 900


def webgl_path(t: float) -> Path:
    return OUT / ("webgl-t0.6.png" if t == 0.6 else f"webgl-t{int(t)}.png")


def main() -> None:
    rows = []
    for t in TIMES:
        v3 = Image.open(V3 / f"v3-t{t:.1f}.png").convert("RGB")
        wg = Image.open(webgl_path(t)).convert("RGB")
        if v3.size != (W, H):
            v3 = v3.resize((W, H), Image.Resampling.LANCZOS)
        if wg.size != (W, H):
            wg = wg.resize((W, H), Image.Resampling.LANCZOS)
        row = Image.new("RGB", (W * 2, H))
        row.paste(v3, (0, 0))
        row.paste(wg, (W, 0))
        rows.append(row)

    grid_h = H * len(TIMES) + 48
    grid = Image.new("RGB", (W * 2, grid_h), (20, 20, 20))
    y = 40
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    draw = ImageDraw.Draw(grid)
    draw.text((12, 8), "v3 reference (left) vs WebGL (right)", fill=(220, 220, 220), font=font)
    for i, t in enumerate(TIMES):
        draw.text((12, y - 28), f"t = {t:.1f} s", fill=(180, 180, 180), font=font)
        grid.paste(rows[i], (0, y))
        y += H
    out = OUT / "hero-ab-grid.png"
    grid.save(out, optimize=True)
    print(out)


if __name__ == "__main__":
    main()
