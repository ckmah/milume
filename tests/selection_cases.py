"""Deterministic lasso hit-test cases (170k points) shared by the test and its fixture."""

from __future__ import annotations

import numpy as np

N_POINTS = 170_000


def points() -> tuple[np.ndarray, np.ndarray]:
    """Random floats, integer-grid points that land on edges/vertices, and non-finite."""
    rng = np.random.default_rng(306)
    n_grid = 41 * 41
    n_bad = 6
    n_rand = N_POINTS - n_grid - n_bad
    rx = rng.uniform(-12.0, 12.0, n_rand)
    ry = rng.uniform(-12.0, 12.0, n_rand)
    gx, gy = np.meshgrid(np.arange(-10.0, 11.0, 0.5), np.arange(-10.0, 11.0, 0.5))
    gx, gy = gx.ravel()[:n_grid], gy.ravel()[:n_grid]
    bad_x = np.array([np.nan, 0.0, np.inf, -np.inf, 1.0, np.nan])
    bad_y = np.array([0.0, np.nan, 0.0, 1.0, np.inf, np.nan])
    return np.concatenate([rx, gx, bad_x]), np.concatenate([ry, gy, bad_y])


def polygons() -> dict[str, list[tuple[float, float]]]:
    rng = np.random.default_rng(309)
    # Smooth freehand lasso (simple polygon, 400 vertices).
    t = np.linspace(0.0, 2 * np.pi, 400, endpoint=False)
    r = 7.0 + 1.5 * np.sin(5 * t) + 0.6 * np.cos(11 * t)
    lasso = list(zip(r * np.cos(t), r * np.sin(t)))
    # Freehand scribble that crosses itself many times.
    scribble = list(zip(rng.uniform(-10, 10, 60), rng.uniform(-10, 10, 60)))
    # Integer-vertex shapes: grid points sit exactly on their edges and vertices.
    square = [(-5.0, -5.0), (5.0, -5.0), (5.0, 5.0), (-5.0, 5.0)]
    bowtie = [(-6.0, -6.0), (6.0, 6.0), (6.0, -6.0), (-6.0, 6.0)]
    star = [
        (8.0 * np.cos(np.pi / 2 + k * 4 * np.pi / 5), 8.0 * np.sin(np.pi / 2 + k * 4 * np.pi / 5))
        for k in range(5)
    ]
    # Figure-eight lasso drawn as one stroke (lobes wind opposite ways).
    s = np.linspace(0.0, 2 * np.pi, 240, endpoint=False)
    eight = list(zip(8.0 * np.sin(s), 4.0 * np.sin(2 * s)))
    # Explicitly closed ring with duplicate and collinear vertices.
    closed = [(-4.0, -2.0), (0.0, -2.0), (0.0, -2.0), (4.0, -2.0), (4.0, 3.0), (-4.0, 3.0), (-4.0, -2.0)]
    return {
        "lasso": [(float(a), float(b)) for a, b in lasso],
        "scribble": [(float(a), float(b)) for a, b in scribble],
        "square": square,
        "bowtie": bowtie,
        "star": [(float(a), float(b)) for a, b in star],
        "figure_eight": [(float(a), float(b)) for a, b in eight],
        "closed_ring": closed,
    }
