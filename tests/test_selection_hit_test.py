"""Lasso / polygon hit-testing matches matplotlib's ``Path.contains_points`` bit for bit."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from milume.selection import points_in_polygon, selection_mask
from tests.selection_cases import N_POINTS, points, polygons

FIXTURE = Path(__file__).parent / "data" / "selection_hit_test_matplotlib.npz"
CASES = polygons()


def _expected(name: str, n: int) -> np.ndarray:
    with np.load(FIXTURE) as f:
        return np.unpackbits(f[name])[:n].astype(bool)


@pytest.fixture(scope="module")
def xy():
    return points()


@pytest.mark.parametrize("name", list(CASES))
def test_hit_test_matches_matplotlib_fixture_at_170k(xy, name):
    x, y = xy
    assert x.shape[0] == N_POINTS
    got = points_in_polygon(CASES[name], x, y)
    want = _expected(name, N_POINTS)
    assert got.dtype == bool and got.shape == want.shape
    assert want.any() and not want.all()
    np.testing.assert_array_equal(got, want)


@pytest.mark.parametrize("name", list(CASES))
def test_hit_test_matches_live_matplotlib_at_170k(xy, name):
    mpath = pytest.importorskip("matplotlib.path")
    x, y = xy
    want = mpath.Path(CASES[name]).contains_points(np.column_stack([x, y]))
    np.testing.assert_array_equal(points_in_polygon(CASES[name], x, y), want)


def test_lasso_selection_mask_uses_the_same_hit_test(xy):
    x, y = xy
    sel = {"id": "s", "type": "lasso", "vertices": [list(v) for v in CASES["scribble"]]}
    np.testing.assert_array_equal(selection_mask([sel], x, y, "s"), _expected("scribble", N_POINTS))


def test_log_scale_points_outside_the_domain_are_never_selected():
    sel = {"id": "s", "type": "polygon", "vertices": [[-1, -1], [1, -1], [1, 1], [-1, 1]]}
    x = np.array([1.0, 0.0, -1.0, 2.0])
    y = np.array([1.0, 1.0, 1.0, 1.0])
    # log10 -> 0, -inf, nan, 0.30; only the first is inside [-1, 1]^2.
    with np.errstate(divide="ignore", invalid="ignore"):
        mask = selection_mask([sel], x, y, "s", x_scale="log", y_scale="log")
    assert mask.tolist() == [True, False, False, True]
