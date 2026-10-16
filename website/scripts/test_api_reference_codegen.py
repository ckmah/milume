#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from api_reference_codegen import (
    _parse_traitlets,
    render_constructor_params_markdown,
    render_geodataframe_markdown,
    render_methods_markdown,
    render_traitlets_markdown,
)


def test_traitlets_parsed_from_landmarks() -> None:
    source = (Path(__file__).resolve().parents[2] / "milume" / "landmarks.py").read_text()
    rows = _parse_traitlets(source)
    names = {r.name for r in rows}
    assert "selections" in names
    assert "render_mode" in names
    assert len(rows) > 40


def test_public_traitlet_tables() -> None:
    md = render_traitlets_markdown()
    assert "_PUBLIC_TRAITS" in md
    assert "`selections`" in md
    assert "`render_mode`" not in md
    assert "Notebook traitlets" not in md


def test_constructor_params_no_traitlet_section() -> None:
    md = render_constructor_params_markdown()
    assert "#### Parameters" in md
    assert "Notebook traitlets" not in md


def test_geodataframe_docs_use_peek() -> None:
    md = render_geodataframe_markdown()
    assert "landmarks_to_geodataframe" in md
    assert "milume.peek" in md
    assert "```python" in md


def test_api_headings_short_for_toc() -> None:
    methods = render_methods_markdown()
    assert "### `set_points()`" in methods
    assert methods.count("def set_points") >= 1
    assert "### `def set_points" not in methods
    gdf = render_geodataframe_markdown()
    assert "### `landmarks_to_geodataframe()`" in gdf
    traits = render_traitlets_markdown()
    assert "milume-api-traitlet-table" in traits
