#!/usr/bin/env python3
"""Near-black pixel fraction (L < 0.06) for v3 vs WebGL frames."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/cursor/artifacts/hero-ab")
V3 = Path(sys.argv[2] if len(sys.argv) > 2 else "/opt/cursor/artifacts/v3-frames")
TIMES = [0.6, 3.0, 8.0]
L_THRESH = 0.06


def lum_rgb(img: np.ndarray) -> np.ndarray:
    return 0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]


def frac_dark(path: Path) -> float:
    a = np.array(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
    return float((lum_rgb(a) < L_THRESH).mean())


def webgl_path(t: float) -> Path:
    return OUT / ("webgl-t0.6.png" if t == 0.6 else f"webgl-t{int(t)}.png")


def main() -> None:
    report = []
    for t in TIMES:
        v3p = V3 / f"v3-t{t:.1f}.png"
        wgp = webgl_path(t)
        v3d = frac_dark(v3p)
        wgd = frac_dark(wgp)
        report.append(
            {
                "t": t,
                "v3_frac_dark": v3d,
                "webgl_frac_dark": wgd,
                "delta": wgd - v3d,
            }
        )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "gap-metric.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
