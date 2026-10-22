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


def test_milume_never_imports_matplotlib():
    import ast
    import subprocess
    import sys
    import textwrap

    root = Path(__file__).resolve().parents[1]
    for path in (root / "milume").rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(), filename=str(path))):
            if isinstance(node, ast.Import):
                mods = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                mods = [node.module or ""]
            else:
                continue
            assert all(m.split(".")[0] != "matplotlib" for m in mods), f"{path}: imports matplotlib"
    code = textwrap.dedent(
        """
        import sys
        class Block:
            def find_spec(self, name, path=None, target=None):
                if name.split('.')[0] == 'matplotlib':
                    raise ModuleNotFoundError(name)
        sys.meta_path.insert(0, Block())
        import numpy as np
        from milume import LandmarksWidget
        from tests.helpers import adata_xy
        a = adata_xy([0, 1, 2, 3], [0, 1, 0, 1], color=["a", "b", "a", "c"], color_key="t")
        a.obs["score"] = [0.1, 0.5, 0.2, 0.9]
        w = LandmarksWidget(a, color="t")
        w.color = "score"
        w.selections = [{"id": "s", "type": "lasso", "vertices": [[-1, -1], [1.5, -1], [1.5, 2], [-1, 2]]}]
        print(sorted(w.get_obs_names("s")))
        """
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=root)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == "['c0', 'c1']"
