"""Regenerate the matplotlib reference fixtures (run once, in an env that has matplotlib).

    python tests/data/make_matplotlib_fixtures.py

Writes ``palettes_matplotlib.json`` (tab10/20/20b/20c and the default sequential
palette) and ``selection_hit_test_matplotlib.npz`` (``Path.contains_points``
masks for the 170k-point cases in ``tests/selection_cases.py``).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib
import matplotlib.colors as mcolors
import numpy as np
from matplotlib.path import Path as MplPath

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent.parent))

from tests.selection_cases import points, polygons  # noqa: E402


def _tab(name: str) -> list[str]:
    cmap = matplotlib.colormaps[name]
    return [mcolors.to_hex(cmap(i)).lower() for i in range(cmap.N)]


def _seq(n: int, low: str = "#f3e6d4", high: str = "#ff0099") -> list[str]:
    cmap = mcolors.LinearSegmentedColormap.from_list("seq", [low, high], N=max(n, 2))
    if n <= 1:
        return [mcolors.to_hex(cmap(0.5))]
    return [mcolors.to_hex(cmap(i / (n - 1))) for i in range(n)]


def main() -> None:
    palettes = {
        "matplotlib_version": matplotlib.__version__,
        "tab": {k: _tab(k) for k in ("tab10", "tab20", "tab20b", "tab20c")},
        "sequential": {str(n): _seq(n) for n in (1, 2, 3, 7, 64, 256)},
    }
    (HERE / "palettes_matplotlib.json").write_text(json.dumps(palettes, indent=1))

    x, y = points()
    pts = np.column_stack([x, y])
    masks = {
        name: np.packbits(MplPath(verts).contains_points(pts))
        for name, verts in polygons().items()
    }
    np.savez_compressed(
        HERE / "selection_hit_test_matplotlib.npz",
        matplotlib_version=np.array(matplotlib.__version__),
        **masks,
    )


if __name__ == "__main__":
    main()
