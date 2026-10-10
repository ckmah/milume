#!/usr/bin/env python3
"""Render LandmarksWidget API reference as plain markdown for agent mirrors."""

from __future__ import annotations

import ast
from pathlib import Path

import griffe

# Public notebook API methods defined on LandmarksWidget in milume/landmarks.py.
_NOTEBOOK_METHODS = (
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


def _module_string_constants(tree: ast.Module) -> dict[str, str]:
    constants: dict[str, str] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
            continue
        name = node.targets[0].id
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            constants[name] = node.value.value
    return constants


def _eval_string_expr(node: ast.AST, constants: dict[str, str]) -> str:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Name):
        if node.id not in constants:
            raise RuntimeError(f"unknown string constant {node.id!r}")
        return constants[node.id]
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return _eval_string_expr(node.left, constants) + _eval_string_expr(
            node.right, constants
        )
    raise TypeError(f"unsupported docstring expression: {ast.dump(node)}")


def _landmarks_api_doc(root: Path) -> str:
    """Return the evaluated _LANDMARKS_API_DOC string without importing milume."""
    path = root / "milume" / "landmarks.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    constants = _module_string_constants(tree)
    if "_LANDMARKS_API_DOC" not in constants:
        raise RuntimeError("_LANDMARKS_API_DOC not found in milume/landmarks.py")
    return constants["_LANDMARKS_API_DOC"]


def _peek_doc(root: Path) -> str:
    path = root / "milume" / "__init__.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    constants = _module_string_constants(tree)
    constants["_LANDMARKS_API_DOC"] = _landmarks_api_doc(root)
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if (
                isinstance(target, ast.Attribute)
                and isinstance(target.value, ast.Name)
                and target.value.id == "peek"
                and target.attr == "__doc__"
            ):
                return _eval_string_expr(node.value, constants).strip()
    raise RuntimeError("peek.__doc__ assignment not found in milume/__init__.py")


def render_landmarks_widget_api() -> str:
    root = Path(__file__).resolve().parents[2]
    module = griffe.load("milume.landmarks", search_paths=[str(root)])
    widget = module.classes["LandmarksWidget"]

    parts = [
        "# LandmarksWidget API",
        "",
        "Generated from `milume.landmarks.LandmarksWidget` docstrings.",
        "For narrative guides, see [Quickstart](../quickstart.md).",
        "",
    ]

    root_pkg = griffe.load("milume", search_paths=[str(root)])
    peek_fn = root_pkg.functions.get("peek")
    if peek_fn is not None:
        try:
            peek_sig = peek_fn.signature()
        except (AttributeError, TypeError):
            peek_sig = "peek(...)"
        parts.extend(
            [
                f"## `def {peek_sig}`",
                "",
                _peek_doc(root),
                "",
                "---",
                "",
            ]
        )

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
