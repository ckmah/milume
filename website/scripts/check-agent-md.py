#!/usr/bin/env python3
"""Fail if agent-facing markdown still contains mkdocstrings directives."""

from __future__ import annotations

import sys
from pathlib import Path

MARKER = ":::"


def paths_to_check(site_root: Path) -> list[Path]:
    paths: list[Path] = []
    for pattern in ("**/*.md", "llms.txt", "llms-full.txt"):
        paths.extend(site_root.glob(pattern))
    return sorted({p for p in paths if p.is_file()})


def main() -> int:
    site_root = Path(sys.argv[1] if len(sys.argv) > 1 else "site").resolve()
    if not site_root.is_dir():
        print(f"check-agent-md: missing site directory: {site_root}", file=sys.stderr)
        return 1

    offenders: list[str] = []
    for path in paths_to_check(site_root):
        text = path.read_text(encoding="utf-8")
        if MARKER in text:
            offenders.append(str(path.relative_to(site_root)))

    if offenders:
        print("check-agent-md: mkdocstrings directives must not appear in agent outputs:", file=sys.stderr)
        for path in offenders:
            print(f"  - {path}", file=sys.stderr)
        return 1

    print("check-agent-md ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
