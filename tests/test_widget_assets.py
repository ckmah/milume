"""Structural guards for the anywidget asset contract (ADR 0001, widget-packaging)."""

from pathlib import Path

import pytest
from anywidget._file_contents import FileContents

from milume.landmarks import LandmarksWidget

PKG = Path(__file__).resolve().parents[1] / "milume"


@pytest.mark.parametrize("attr", ["_esm", "_css"])
def test_widget_assets_are_bundled_paths(attr):
    """A Path (not read text) lets anywidget watch the file for HMR.

    anywidget wraps a Path in FileContents; a str (e.g. from `.read_text()`) stays a str.
    """
    value = getattr(LandmarksWidget, attr)
    assert isinstance(value, FileContents)
    path = Path(value._path)
    assert path.is_file()
    assert PKG / "static" / "bundled" in path.resolve().parents


def test_python_sources_do_not_point_at_vite_dev_server():
    offenders = [
        p.name for p in PKG.glob("*.py") if "localhost:5173" in p.read_text(encoding="utf-8")
    ]
    assert not offenders
