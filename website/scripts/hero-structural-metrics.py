#!/usr/bin/env python3
"""SSIM + 8x8 tile luminance correlation between v3 PNGs and WebGL captures."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/cursor/artifacts/hero-ab")
V3 = Path(sys.argv[2] if len(sys.argv) > 2 else "/opt/cursor/artifacts/v3-frames")
TIMES = [0.6, 3.0, 8.0]
SIZE = 160


def gray(img: np.ndarray) -> np.ndarray:
    return (0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]).astype(np.float32)


def downsample(a: np.ndarray, w: int, h: int) -> np.ndarray:
    im = Image.fromarray((a * 255).astype(np.uint8) if a.max() <= 1.0 else a.astype(np.uint8))
    return np.array(im.resize((w, h), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0


def ssim(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(np.float64)
    b = b.astype(np.float64)
    c1 = (0.01 * 1) ** 2
    c2 = (0.03 * 1) ** 2
    mu_a = a.mean()
    mu_b = b.mean()
    sig_a = a.var()
    sig_b = b.var()
    sig_ab = ((a - mu_a) * (b - mu_b)).mean()
    num = (2 * mu_a * mu_b + c1) * (2 * sig_ab + c2)
    den = (mu_a**2 + mu_b**2 + c1) * (sig_a + sig_b + c2)
    return float(num / den) if den else 0.0


def tile_corr(a: np.ndarray, b: np.ndarray, tiles: int = 8) -> float:
    h, w = a.shape
    th, tw = h // tiles, w // tiles
    corrs = []
    for ty in range(tiles):
        for tx in range(tiles):
            ya, yb = ty * th, (ty + 1) * th
            xa, xb = tx * tw, (tx + 1) * tw
            va = a[ya:yb, xa:xb].ravel()
            vb = b[ya:yb, xa:xb].ravel()
            if va.std() < 1e-6 or vb.std() < 1e-6:
                continue
            c = np.corrcoef(va, vb)[0, 1]
            if np.isfinite(c):
                corrs.append(float(c))
    return float(np.mean(corrs)) if corrs else 0.0


def webgl_path(t: float) -> Path:
    return OUT / ("webgl-t0.6.png" if t == 0.6 else f"webgl-t{int(t)}.png")


def main() -> None:
    report = []
    for t in TIMES:
        v3 = np.array(Image.open(V3 / f"v3-t{t:.1f}.png").convert("RGB"), dtype=np.float32) / 255.0
        wg = np.array(Image.open(webgl_path(t)).convert("RGB"), dtype=np.float32) / 255.0
        g3 = downsample(gray(v3), SIZE, SIZE)
        gw = downsample(gray(wg), SIZE, SIZE)
        report.append(
            {
                "t": t,
                "ssim": ssim(g3, gw),
                "tileCorr": tile_corr(g3, gw),
            }
        )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "structural.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
