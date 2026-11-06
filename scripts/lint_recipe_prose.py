#!/usr/bin/env python3
"""Fail when recipe mo.md prose uses plain (non-f) strings that contain digits."""

from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECIPES_DIR = ROOT / "demos" / "recipes"

# Skip tooling-only modules.
SKIP_NAMES = frozenset({"__init__", "squidpy_color_numbers"})


def _iter_mo_md_calls(tree: ast.Module) -> list[ast.Call]:
    out: list[ast.Call] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr == "md":
            if isinstance(func.value, ast.Name) and func.value.id == "mo":
                out.append(node)
    return out


def _string_body(call: ast.Call) -> str | None:
    if not call.args:
        return None
    arg0 = call.args[0]
    if isinstance(arg0, ast.Constant) and isinstance(arg0.value, str):
        return arg0.value
    return None


def lint_file(path: Path, *, allow_substrings: frozenset[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text, filename=str(path))
    failures: list[str] = []
    for call in _iter_mo_md_calls(tree):
        body = _string_body(call)
        if body is None:
            continue
        if not re.search(r"\d", body):
            continue
        allowed = False
        for frag in allow_substrings:
            if frag and frag in body:
                allowed = True
                break
        if not allowed:
            failures.append(
                f"{path.relative_to(ROOT)}:{call.lineno}: mo.md() uses a non-f-string "
                "prose block that still contains digits (use mo.md(f\"...\") with values "
                "from recipe modules, or extend the allowlist for this recipe)."
            )
    return failures


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--recipe",
        default="",
        help="Lint only demos/recipes/<name>.py (default: every recipe notebook).",
    )
    args = ap.parse_args()

    allow_by_recipe: dict[str, frozenset[str]] = {
        # Intentionally empty: recipes should use f-strings on computed values.
        "squidpy_color": frozenset(),
    }

    paths: list[Path]
    if args.recipe:
        paths = [RECIPES_DIR / f"{args.recipe}.py"]
    else:
        paths = sorted(RECIPES_DIR.glob("*.py"))

    all_failures: list[str] = []
    for path in paths:
        if not path.is_file():
            print(f"lint-recipe-prose: missing {path}", file=sys.stderr)
            return 1
        stem = path.stem
        if stem in SKIP_NAMES or stem.endswith("_helpers"):
            continue
        allow = allow_by_recipe.get(stem, frozenset())
        all_failures.extend(lint_file(path, allow_substrings=allow))

    if all_failures:
        print("lint-recipe-prose: failed", file=sys.stderr)
        for line in all_failures:
            print(line, file=sys.stderr)
        return 1

    print("lint-recipe-prose: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
