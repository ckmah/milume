#!/usr/bin/env python3
"""Render LandmarksWidget API reference as plain markdown for agent mirrors."""

from __future__ import annotations

import inspect
from textwrap import dedent

from milume.landmarks import _LANDMARKS_API_DOC, LandmarksWidget

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


def _signature(name: str, method: object) -> str:
    try:
        sig = inspect.signature(method)
    except (TypeError, ValueError):
        return f"def {name}(...)"
    return f"def {name}{sig}"


def render_landmarks_widget_api() -> str:
    parts = [
        "# LandmarksWidget API",
        "",
        "Generated from `milume.landmarks.LandmarksWidget` docstrings.",
        "For narrative guides, see [LandmarksWidget](../landmarks.md).",
        "",
    ]
    if _LANDMARKS_API_DOC:
        parts.extend([dedent(_LANDMARKS_API_DOC).strip(), "", "---", ""])

    class_doc = inspect.getdoc(LandmarksWidget) or ""
    parts.extend([f"## `LandmarksWidget`", "", class_doc, ""])

    for name in _NOTEBOOK_METHODS:
        method = getattr(LandmarksWidget, name, None)
        if method is None:
            continue
        doc = inspect.getdoc(method) or ""
        parts.extend([f"### `{_signature(name, method)}`", "", doc, ""])

    return "\n".join(parts).strip() + "\n"


if __name__ == "__main__":
    print(render_landmarks_widget_api(), end="")
