
def test_squidpy_recipe_does_not_import_tests_package():
    src = (ROOT / "demos" / "recipes" / "squidpy_color.py").read_text()
    assert "from tests" not in src
    assert "import tests" not in src
