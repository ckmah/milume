"""Recipe notebooks must run on molab without the tests package."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_squidpy_recipe_does_not_import_tests_package():
    recipes = sorted((ROOT / "demos" / "recipes").glob("*.py"))
    checked = [
        path
        for path in recipes
        if path.name != "__init__.py" and "import marimo" in path.read_text()
    ]
    assert {path.name for path in checked} >= {"squidpy_color.py", "squidpy_moran.py"}
    for path in checked:
        src = path.read_text()
        assert "from tests" not in src, path.name
        assert "import tests" not in src, path.name
