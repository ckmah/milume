#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

import pytest

from docs_redirects import REDIRECTS_FILE, load_redirect_map, write_docs_redirects

ROOT = Path(__file__).resolve().parent.parent.parent

EXPECTED_REDIRECTS = {
    "integrations/squidpy-color": "how-to/recipes/squidpy_color/",
    "install": "get-started/install/",
    "quickstart": "get-started/tutorial-explore-cells-2d/",
    "tools/measure": "reference/api/measure/",
    "api/landmarks": "reference/api/landmarks/",
}


def test_redirect_map_covers_phase1_moves() -> None:
    mapping = load_redirect_map()
    for old, new in EXPECTED_REDIRECTS.items():
        assert mapping[old] == new


def test_redirect_map_lists_squidpy_integration() -> None:
    text = REDIRECTS_FILE.read_text(encoding="utf-8")
    assert "integrations/squidpy-color" in text
    assert "how-to/recipes/squidpy_color" in text


def test_write_docs_redirect_stubs(tmp_path: Path) -> None:
    site = tmp_path / "site"
    docs = site / "docs"
    target = docs / "how-to" / "recipes" / "squidpy_color" / "index.html"
    target.parent.mkdir(parents=True)
    target.write_text("<html><body>recipe</body></html>", encoding="utf-8")

    redirects_toml = tmp_path / "redirects.toml"
    redirects_toml.write_text(
        '[redirects]\n"integrations/squidpy-color" = "how-to/recipes/squidpy_color/"\n',
        encoding="utf-8",
    )

    pairs = write_docs_redirects(site, redirects_path=redirects_toml)
    assert pairs == [("integrations/squidpy-color", "how-to/recipes/squidpy_color/")]

    dir_stub = docs / "integrations" / "squidpy-color" / "index.html"
    flat_stub = docs / "integrations" / "squidpy-color.html"
    assert dir_stub.is_file()
    assert flat_stub.is_file()

    for stub in (dir_stub, flat_stub):
        html = stub.read_text(encoding="utf-8")
        assert (
            'rel="canonical" href="https://ckmah.github.io/milume/docs/how-to/recipes/squidpy_color/"'
            in html
        )
        assert "location.replace(" in html
        assert 'meta http-equiv="refresh"' in html
        assert "../../how-to/recipes/squidpy_color/" in html or "../how-to/recipes/squidpy_color/" in html


def test_write_docs_redirect_requires_target(tmp_path: Path) -> None:
    site = tmp_path / "site"
    (site / "docs").mkdir(parents=True)
    with pytest.raises(SystemExit, match="redirect target missing"):
        write_docs_redirects(site, redirects_path=REDIRECTS_FILE)
