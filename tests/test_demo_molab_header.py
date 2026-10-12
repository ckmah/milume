"""Demos expose a static molab tip as marimo's first markdown cell."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMOS = ROOT / "demos"

# Keep in sync with the first-cell mo.md block in every demos/*.py notebook.
MOLAB_RUN_ON_SERVER_MARKDOWN = (
    "> **molab:** Switch from **Preview** to **Run on Server** so this notebook runs "
    "properly. The widget needs a live kernel to download data and render; Preview "
    "alone will not run this notebook."
)


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
    demo_paths = sorted(DEMOS.glob("*.py"))
    assert demo_paths, "expected at least one marimo demo under demos/"

    for path in demo_paths:
        body = _first_app_cell_source(path)
        assert "mo.md(" in body, path
        assert "import marimo" not in body, path
        assert MOLAB_RUN_ON_SERVER_MARKDOWN.strip() in body, path
