#!/usr/bin/env python3
"""Regenerate website/landing/assets/hero-points.bin from herolib v3 field parameters."""
from __future__ import annotations

import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "landing" / "assets" / "hero-points.bin"

L = 10.0
NC = 24
N = 2700
rng = np.random.default_rng(11)
cent = np.c_[rng.uniform(-15, 15, NC), rng.uniform(-9, 9, NC), rng.uniform(0, L, NC)]
ccat = rng.integers(0, 4, NC)
ci = rng.integers(0, NC, N)
P = cent[ci] + rng.normal(0, 2.2, (N, 3)) * [1, 1, 0.8]
P[:, 2] += rng.uniform(-1.5, 1.5, N)
P[:, 2] %= L
cat = np.where(rng.random(N) < 0.78, ccat[ci], rng.integers(0, 4, N))
rad = rng.uniform(0.14, 0.24, N)

OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open("wb") as f:
    f.write(struct.pack("<I", N))
    for i in range(N):
        f.write(struct.pack("<3f", *P[i]))
        f.write(struct.pack("<B", int(cat[i])))
        f.write(struct.pack("<f", rad[i]))
print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
