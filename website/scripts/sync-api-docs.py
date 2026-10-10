#!/usr/bin/env python3
"""Write generated API markdown snippets before Zensical build."""

from __future__ import annotations

import ast
import sys
from pathlib import Path

from agent_md_format import numpy_doc_to_markdown


def _landmarks_api_doc(root: Path) -> str:
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
                return value.strip() + "\n"
    raise RuntimeError("_LANDMARKS_API_DOC not found in milume/landmarks.py")


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    partials = root / "website" / "snippets"
    partials.mkdir(parents=True, exist_ok=True)
    out = partials / "api-params.md"
    out.write_text(numpy_doc_to_markdown(_landmarks_api_doc(root)) + "\n", encoding="utf-8")
    print(f"sync-api-docs: wrote {out.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
