"""Demos expose a static molab tip as marimo's first markdown cell."""

import importlib.util
from pathlib import Path

from marimo._ast.app import InternalApp

from demos.molab_header import MOLAB_RUN_ON_SERVER_MARKDOWN

ROOT = Path(__file__).resolve().parents[1]
DEMOS = ROOT / "demos"


def _load_app(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod.app


def test_each_demo_opens_with_shared_molab_markdown_cell():
    demo_paths = sorted(DEMOS.glob("*.py"))
    demo_paths = [p for p in demo_paths if p.name != "molab_header.py"]
    assert demo_paths, "expected at least one marimo demo under demos/"

    for path in demo_paths:
        app = _load_app(path)
        cells = list(InternalApp(app).cell_manager.cells())
        assert cells, f"{path} has no cells"
        first = cells[0]._cell
        assert first.markdown == MOLAB_RUN_ON_SERVER_MARKDOWN.strip(), path
        assert "import marimo" not in first.code, path
