#!/usr/bin/env python3
"""Fraction of visible field instances with herolib coc below threshold (WebGL vs ref)."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("herolib", ROOT / "scripts" / "herolib_v3.py")
herolib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(herolib)

TIMES = [0.6, 3.0, 8.0]
THRESHOLDS = [1.0, 2.0, 5.0]
ZN0, ZN1, ZF0, ZF1 = 0.5, 3.0, 22.0, 30.0


def ss(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def zf_at(t: float, c: np.ndarray, pulse_a: float) -> float:
    zf = 11.0
    if pulse_a > 0:
        zf = 11.0 + pulse_a * ((herolib.SEL[2] - c[2]) - 11.0)
    return float(zf)


def visible_mask(z: np.ndarray) -> np.ndarray:
    alpha = ss(ZN0, ZN1, z) * (1 - ss(ZF0, ZF1, z))
    return (z > ZN0) & (z < ZF1) & (alpha > 0.004)


def herolib_coc(z: np.ndarray, zf: float) -> np.ndarray:
    return np.minimum(40, 40 * np.abs(1 / z - 1 / zf) * zf)


def stats_for_time(t: float) -> dict:
    c, _ = herolib.cam(t)
    d = herolib.Q0 - c
    z = d[:, 2]
    m = visible_mask(z)
    zv = z[m]
    p = herolib.pulse(t)
    pulse_a = float(p[1]) if p else 0.0
    zf = zf_at(t, c, pulse_a)
    coc = herolib_coc(zv, zf)
    dz = np.abs(zv - zf)
    n = len(zv)
    out: dict = {"t": t, "zf": zf, "visible": n, "pulseA": pulse_a}
    for th in THRESHOLDS:
        out[f"frac_coc_lt_{th}"] = float((coc < th).mean())
    out["frac_dz_le_1"] = float((dz <= 1.0).mean())
    out["frac_coc_lt_2_and_dz_le_1"] = float(((coc < 2.0) & (dz <= 1.0)).mean())
    # WebGL draws crisp instances when camera-relative |z - zf| <= 1 (same z, zf as herolib).
    out["webgl_crisp_frac"] = out["frac_dz_le_1"]
    out["herolib_ref_coc_lt_2"] = out["frac_coc_lt_2.0"]
    return out


def main() -> None:
    report = [stats_for_time(t) for t in TIMES]
    out_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/cursor/artifacts/hero-ab/coc-fraction.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
