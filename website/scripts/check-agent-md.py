#!/usr/bin/env python3
"""Fail if agent-facing markdown is not plain, readable text."""

from __future__ import annotations

import re
import sys
from pathlib import Path

MARKER = ":::"
_ESCAPED_NEWLINE = re.compile(r"\\n")
_QUOTED_DOCSTRING_LINE = re.compile(r"""^\s*['"].*\\n""")
_INTERNAL_DOCS_LINK = re.compile(
    r"https://github\.com/ckmah/milume/blob/[^)\s]+/docs/",
    re.IGNORECASE,
)
_SPHINX_ROLE = re.compile(r":\w+:`")
_DOCTEST_LINE = re.compile(r"^\s*>>>")


def paths_to_check(site_root: Path) -> list[Path]:
    paths: list[Path] = []
    for pattern in ("**/*.md", "llms.txt", "llms-full.txt"):
        paths.extend(site_root.glob(pattern))
    return sorted({p for p in paths if p.is_file()})


def lint_agent_text(text: str) -> list[str]:
    issues: list[str] = []
    if MARKER in text:
        issues.append("contains mkdocstrings ::: directive")
    if _ESCAPED_NEWLINE.search(text):
        issues.append("contains literal \\n escape sequences")
    for line in text.splitlines():
        if _QUOTED_DOCSTRING_LINE.match(line):
            issues.append("contains a quote-wrapped line with escaped newlines")
            break
    if _INTERNAL_DOCS_LINK.search(text):
        issues.append("links to internal engineering docs/ on GitHub")
    if _SPHINX_ROLE.search(text):
        issues.append("contains Sphinx :role:`...` markup")
    in_fence = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence and _DOCTEST_LINE.match(line):
            issues.append("contains >>> doctest line outside a fenced code block")
            break
    return issues


def main() -> int:
    site_root = Path(sys.argv[1] if len(sys.argv) > 1 else "site").resolve()
    if not site_root.is_dir():
        print(f"check-agent-md: missing site directory: {site_root}", file=sys.stderr)
        return 1

    offenders: list[str] = []
    for path in paths_to_check(site_root):
        text = path.read_text(encoding="utf-8")
        for issue in lint_agent_text(text):
            offenders.append(f"{path.relative_to(site_root)}: {issue}")

    if offenders:
        print("check-agent-md failed:", file=sys.stderr)
        for entry in offenders:
            print(f"  - {entry}", file=sys.stderr)
        return 1

    print("check-agent-md ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
