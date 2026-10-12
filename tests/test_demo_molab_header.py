"""Demos expose a static molab tip as marimo's first markdown cell."""

import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMOS = ROOT / "demos"


def _load_molab_header_module():
    path = DEMOS / "molab_header.py"
    spec = importlib.util.spec_from_file_location("molab_header", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def _first_app_cell_source(path: Path) -> str:
    src = path.read_text()
    assert re.search(
        r"@app\.cell\(hide_code=True\)\s*\ndef _\(mo\):",
        src,
    ), f"{path} first cell must be hide_code markdown with def _(mo):"
    match = re.search(
        r"@app\.cell\(hide_code=True\)\s*\ndef _\(mo\):\s*(.*?)(?=\n@app\.cell|\nif __name__)",
        src,
        re.DOTALL,
    )
    assert match, f"could not parse first cell body in {path}"
    return match.group(1)


def test_each_demo_opens_with_shared_molab_markdown_cell():
    molab_header = _load_molab_header_module()
    expected = molab_header.MOLAB_RUN_ON_SERVER_MARKDOWN

    demo_paths = sorted(p for p in DEMOS.glob("*.py") if p.name != "molab_header.py")
    assert demo_paths, "expected at least one marimo demo under demos/"

    for path in demo_paths:
        body = _first_app_cell_source(path)
        assert "mo.md(" in body, path
        assert "import marimo" not in body, path
        assert expected.strip() in body, path
