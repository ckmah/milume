#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

import pytest

from prepare_recipe_studio import extract_body_fragment, extract_runtime_head

SAMPLE = """<!doctype html>
<html><head>
<base href="./">
<script data-marimo-studio-runtime>cfg</script>
<link data-marimo-studio-runtime rel="stylesheet" href="./_marimo-studio/assets/zero-python/mount.css">
<meta charset="utf-8">
</head><body>
<marimo-cell name="a"></marimo-cell>
<div id="marimo-runtime-root" hidden hx-preserve></div>
<marimo-filename hidden>notebook.py</marimo-filename>
</body></html>
"""


def test_extract_runtime_head_keeps_studio_tags_only() -> None:
    head = extract_runtime_head(SAMPLE)
    assert "data-marimo-studio-runtime" in head
    assert "meta charset" not in head


def test_extract_body_fragment_includes_cells_and_footer() -> None:
    body = extract_body_fragment(SAMPLE)
    assert '<marimo-cell name="a">' in body
    assert "marimo-runtime-root" in body
