"""Notebooks with molab links expose a shared Preview → Run on Server tip."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMOS = ROOT / "demos"
RECIPES = DEMOS / "recipes"

MOLAB_URL = re.compile(r"https://molab\.marimo\.io/")

# Keep in sync with the standalone molab tip markdown cell in every linked notebook.
MOLAB_RUN_ON_SERVER_MARKDOWN = (
    "> **molab:** Switch from **Preview** to **Run on Server** so this notebook runs "
    "properly. The widget needs a live kernel to download data and render; Preview "
    "alone will not run this notebook. After the server connects, click **Run all** "
    "(the ▶ button at the bottom right) to run the notebook."
)


def _notebooks_with_molab_links() -> list[Path]:
    paths: list[Path] = []
    for directory in (DEMOS, RECIPES):
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.py")):
            if MOLAB_URL.search(path.read_text(encoding="utf-8")):
                paths.append(path)
    return paths


def _hide_code_mo_md_bodies(src: str) -> list[str]:
    pattern = re.compile(
        r"@app\.cell\(hide_code=True\)\s*\ndef _\(mo\):\s*(.*?)(?=\n@app\.cell|\nif __name__)",
        re.DOTALL,
    )
    return [m.group(1) for m in pattern.finditer(src)]


def test_linked_notebooks_exist():
    paths = _notebooks_with_molab_links()
    assert paths, "expected at least one notebook with a molab link under demos/"


def test_each_linked_notebook_has_standalone_molab_tip_with_run_all():
    tip = MOLAB_RUN_ON_SERVER_MARKDOWN.strip()
    for path in _notebooks_with_molab_links():
        src = path.read_text(encoding="utf-8")
        bodies = _hide_code_mo_md_bodies(src)
        assert bodies, f"{path}: expected at least one hide_code markdown cell with def _(mo):"
        matching = [b for b in bodies if tip in b]
        assert matching, (
            f"{path}: missing standalone molab tip cell with Run all "
            f"(see MOLAB_RUN_ON_SERVER_MARKDOWN in {__file__})"
        )
        assert "Run all" in matching[0], path


def test_demo_molab_tip_is_first_cell():
    demo_paths = sorted(DEMOS.glob("*.py"))
    assert demo_paths, "expected at least one marimo demo under demos/"
    tip = MOLAB_RUN_ON_SERVER_MARKDOWN.strip()

    for path in demo_paths:
        if not MOLAB_URL.search(path.read_text(encoding="utf-8")):
            continue
        bodies = _hide_code_mo_md_bodies(path.read_text(encoding="utf-8"))
        assert bodies, path
        first = bodies[0]
        assert "mo.md(" in first, path
        assert "import marimo" not in first, path
        assert tip in first, path
