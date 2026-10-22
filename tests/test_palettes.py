"""milume's hardcoded palettes match matplotlib's (live when installed, else the fixture)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from milume.categories import _TAB10, _TAB20, _TAB20B, _TAB20C
from milume.landmarks import _sequential_palette

FIXTURE = json.loads((Path(__file__).parent / "data" / "palettes_matplotlib.json").read_text())
SEQ_SIZES = [1, 2, 3, 7, 64, 256]
OURS = {"tab10": _TAB10, "tab20": _TAB20, "tab20b": _TAB20B, "tab20c": _TAB20C}


def _mpl_tab(name: str) -> list[str]:
    mpl = pytest.importorskip("matplotlib")
    from matplotlib.colors import to_hex

    cmap = mpl.colormaps[name]
    return [to_hex(cmap(i)).lower() for i in range(cmap.N)]


def _mpl_seq(n: int, low: str = "#f3e6d4", high: str = "#ff0099") -> list[str]:
    pytest.importorskip("matplotlib")
    import matplotlib.colors as mcolors

    cmap = mcolors.LinearSegmentedColormap.from_list("seq", [low, high], N=max(n, 2))
    if n <= 1:
        return [mcolors.to_hex(cmap(0.5))]
    return [mcolors.to_hex(cmap(i / (n - 1))) for i in range(n)]


@pytest.mark.parametrize("name", list(OURS))
def test_tab_palette_matches_fixture(name):
    assert OURS[name] == FIXTURE["tab"][name]


@pytest.mark.parametrize("name", list(OURS))
def test_tab_palette_matches_matplotlib(name):
    assert OURS[name] == _mpl_tab(name)


@pytest.mark.parametrize("n", SEQ_SIZES)
def test_sequential_palette_matches_fixture(n):
    assert _sequential_palette(n) == FIXTURE["sequential"][str(n)]


def test_sequential_palette_matches_matplotlib_for_every_size_and_other_stops():
    for n in range(300):
        assert _sequential_palette(n) == _mpl_seq(n), n
    for low, high in [("#000000", "#ffffff"), ("#123456", "#fedcba"), ("#ff0000", "#00ff7f")]:
        for n in (2, 5, 100, 255, 256, 257):
            assert _sequential_palette(n, low, high) == _mpl_seq(n, low, high), (low, high, n)
