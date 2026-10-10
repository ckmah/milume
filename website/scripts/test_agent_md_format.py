#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from agent_md_format import format_agent_docstring, strip_sphinx_roles


def test_strip_sphinx_roles() -> None:
    assert strip_sphinx_roles(":func:`milume.peek`") == "`peek`"
    assert strip_sphinx_roles(":meth:`~milume.landmarks.LandmarksWidget.get_obs_names`") == "`get_obs_names`"


def test_numpy_headings_and_doctest() -> None:
    raw = """Parameters
----------
color
    Point colour column.

Examples
--------
>>> w = milume.peek(adata)
"""
    out = format_agent_docstring(raw)
    assert "#### Parameters" in out
    assert "**color**" in out
    assert "#### Examples" in out
    assert "```python" in out
    assert "w = milume.peek(adata)" in out
    assert ">>>" not in out
