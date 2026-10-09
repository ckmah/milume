#!/usr/bin/env python3
"""Render LandmarksWidget API reference as plain markdown for agent mirrors."""

from __future__ import annotations

import ast
from pathlib import Path

import griffe

# Public notebook API methods defined on LandmarksWidget in milume/landmarks.py.
_NOTEBOOK_METHODS = (
    "set_neighbor_graphs",
    "set_points",
    "set_expression",
    "set_render_mode",
    "set_raster_basis",
    "clear_raster_query",
    "set_color",
    "category_colors",
    "clear_selections",
    "clear_landmarks",
    "clear",
    "get_obs_names",
    "assign_obs_mask",
)


def _landmarks_api_doc(root: Path) -> str:
    """Return the evaluated _LANDMARKS_API_DOC string without importing milume."""
    path = root / "milume" / "landmarks.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "_LANDMARKS_API_DOC":
                value = ast.literal_eval(node.value)
                if not isinstance(value, str):
                    raise TypeError("_LANDMARKS_API_DOC must be a string constant")
                return value
    raise RuntimeError("_LANDMARKS_API_DOC not found in milume/landmarks.py")


def render_landmarks_widget_api() -> str:
    root = Path(__file__).resolve().parents[2]
    module = griffe.load("milume.landmarks", search_paths=[str(root)])
    widget = module.classes["LandmarksWidget"]

    parts = [
        "# LandmarksWidget API",
        "",
        "Generated from `milume.landmarks.LandmarksWidget` docstrings.",
        "For narrative guides, see [LandmarksWidget](../landmarks.md).",
        "",
    ]

    parts.extend([_landmarks_api_doc(root).strip(), "", "---", ""])

    class_doc = widget.docstring.value if widget.docstring else ""
    parts.extend([f"## `{widget.name}`", "", class_doc.strip(), ""])

    for name in _NOTEBOOK_METHODS:
        member = widget.members.get(name)
        if member is None:
            continue
        doc = member.docstring.value if member.docstring else ""
        try:
            signature = member.signature()
        except (AttributeError, TypeError):
            signature = f"{name}(...)"
        parts.extend([f"### `def {signature}`", "", doc.strip(), ""])

    return "\n".join(parts).strip() + "\n"


if __name__ == "__main__":
    print(render_landmarks_widget_api(), end="")
