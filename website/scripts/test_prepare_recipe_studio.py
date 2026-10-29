#!/usr/bin/env python3
from __future__ import annotations

import pytest

from prepare_recipe_studio import (
    RecipeStudioExportError,
    extract_body_fragment,
    extract_runtime_head,
    prepare,
)
from recipe_widget_esm import RecipeWidgetRuntimePatchError

SAMPLE = """<!doctype html>
<html><head>
<base href="./">
<script data-marimo-studio-runtime>cfg</script>
<link data-marimo-studio-runtime rel="stylesheet" href="./_marimo-studio/assets/zero-python/mount.css">
<meta charset="utf-8">
</head><body>
<marimo-cell name="cell-1"></marimo-cell>
<marimo-cell name="landmark_map"></marimo-cell>
<div id="marimo-runtime-root" hidden hx-preserve></div>
<marimo-filename hidden>notebook.py</marimo-filename>
</body></html>
"""


def test_extract_runtime_head_keeps_studio_tags_only() -> None:
    head = extract_runtime_head(SAMPLE, runtime_href="../../assets/marimo-studio-zero-python")
    assert "data-marimo-studio-runtime" in head
    assert "../../assets/marimo-studio-zero-python/assets/" in head
    assert "meta charset" not in head


def test_extract_body_fragment_includes_cells_and_footer() -> None:
    body = extract_body_fragment(SAMPLE)
    assert '<marimo-cell name="cell-1">' in body
    assert "milume-recipe-studio-wide" in body
    assert "marimo-runtime-root" in body


def test_extract_body_fragment_missing_cells_raises() -> None:
    with pytest.raises(RecipeStudioExportError, match="<marimo-cell>"):
        extract_body_fragment("<html><body></body></html>")


def test_prepare_raises_when_runtime_patch_anchor_missing(tmp_path: Path) -> None:
    export_dir = tmp_path / "export"
    assets = export_dir / "_marimo-studio" / "assets" / "zero-python"
    assets.mkdir(parents=True)
    (assets / "zero-python.js").write_text("// patched runtime missing anchors\n", encoding="utf-8")
    (export_dir / "index.html").write_text(SAMPLE, encoding="utf-8")
    content_root = tmp_path / "recipes"
    slug_dir = content_root / "demo"
    slug_dir.mkdir(parents=True)
    with pytest.raises(RecipeWidgetRuntimePatchError, match="anchor not found"):
        prepare("demo", export_dir, content_root=content_root)
