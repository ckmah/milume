#!/usr/bin/env python3
"""Render herolib v3 reference PNGs at given timestamps (seconds)."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

WEBSITE = Path(__file__).resolve().parents[1]
HERO = WEBSITE / "scripts" / "herolib_v3.py"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/opt/cursor/artifacts/v3-frames")
times = [float(x) for x in sys.argv[2:]] if len(sys.argv) > 2 else [0.6, 3.0, 8.0]

spec = importlib.util.spec_from_file_location("herolib_v3", HERO)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

OUT.mkdir(parents=True, exist_ok=True)
for t in times:
    im = mod.render(t)
    path = OUT / f"v3-t{t:.1f}.png"
    im.save(path)
    print(path)
