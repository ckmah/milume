#!/usr/bin/env python3
"""Render LandmarksWidget API reference as plain markdown for agent mirrors."""

from __future__ import annotations

import ast
from pathlib import Path

import griffe

from agent_md_format import format_agent_docstring, strip_sphinx_roles

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
    sys_path = str(Path(__file__).resolve().parent)
    if sys_path not in __import__("sys").path:
        __import__("sys").path.insert(0, sys_path)
    from api_reference_codegen import (
        _signature_fence,
        render_constructor_params_markdown,
        render_geodataframe_markdown,
        render_methods_markdown,
        render_traitlets_markdown,
    )

    parts = [
        "# LandmarksWidget API",
        "",
        "Generated from `milume` sources. For narrative guides, see [Quickstart](../quickstart.md).",
        "",
        "## Constructor parameters",
        "",
        render_constructor_params_markdown().strip(),
        "",
        "## Synced traitlets",
        "",
        render_traitlets_markdown().strip(),
        "",
        "## GeoDataFrame interchange",
        "",
        render_geodataframe_markdown().strip(),
        "",
        "## Methods",
        "",
        render_methods_markdown().strip(),
        "",
    ]

    root_pkg = griffe.load("milume", search_paths=[str(root)])
    peek_fn = root_pkg.functions.get("peek")
    if peek_fn is not None:
        try:
            peek_sig = peek_fn.signature()
        except (AttributeError, TypeError):
            peek_sig = "peek(...)"
        parts = [
            "# LandmarksWidget API",
            "",
            "Generated from `milume` sources. For narrative guides, see [Quickstart](../quickstart.md).",
            "",
            "## `peek()`",
            *_signature_fence(peek_sig, is_method=False),
            format_agent_docstring(_peek_doc(root)),
            "",
            "---",
            "",
            *parts[4:],
        ]

    body = "\n".join(parts).strip() + "\n"
    return strip_sphinx_roles(body)


if __name__ == "__main__":
    print(render_landmarks_widget_api(), end="")
