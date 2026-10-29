#!/usr/bin/env python3
"""Fail if public molab links pin a commit SHA instead of main."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

MOLAB_LANDMARKS_DEMO_URL = (
    "https://molab.marimo.io/github/ckmah/milume/blob/main/demos/landmarks.py"
)

_MOLAB_URL = re.compile(r"https://molab\.marimo\.io/[^\s\"')>\]]+")
_SHA_BLOB = re.compile(r"/blob/[0-9a-f]{40}/", re.IGNORECASE)
_RECIPE_MOLAB = re.compile(
    r"^https://molab\.marimo\.io/github/ckmah/milume/blob/main/demos/recipes/[a-z0-9_]+\.py$"
)
_DEMO_MOLAB = re.compile(
    r"^https://molab\.marimo\.io/github/ckmah/milume/blob/main/demos/[a-z0-9_]+\.py$"
)

SOURCE_PATHS = [
    ROOT / "README.md",
    ROOT / "website" / "landing" / "index.md",
    ROOT / "website" / "landing" / "index.html",
    ROOT / "website" / "content" / "get-started" / "install.md",
]


def paths_to_check(extra_roots: list[Path]) -> list[Path]:
    paths = list(SOURCE_PATHS)
    paths.extend(sorted((ROOT / "website" / "content").rglob("*.md")))
    for root in extra_roots:
        if root.is_dir():
            paths.extend(root.glob("llms.txt"))
            paths.extend(root.glob("llms-full.txt"))
            paths.extend(root.rglob("*.md"))
    return sorted({p for p in paths if p.is_file()})


def lint_molab_urls(text: str, canonical: str) -> list[str]:
    issues: list[str] = []
    for url in _MOLAB_URL.findall(text):
        if _SHA_BLOB.search(url):
            issues.append(f"pinned commit SHA in molab URL: {url}")
        if "github/ckmah/milume/blob/" in url and "/blob/main/" not in url:
            issues.append(f"milume molab URL must use blob/main: {url}")
        if url == canonical or "demos/landmarks.py" in url:
            continue
        if _DEMO_MOLAB.fullmatch(url):
            continue
        if _RECIPE_MOLAB.fullmatch(url):
            continue
        if "github/ckmah/milume/" in url:
            issues.append(
                "unexpected milume molab URL (expected demos/*.py or demos/recipes/*.py): "
                f"{url}"
            )
    return issues


def main() -> int:
    extra = [Path(p).resolve() for p in sys.argv[1:]]
    canonical = MOLAB_LANDMARKS_DEMO_URL
    offenders: list[str] = []
    for path in paths_to_check(extra):
        for issue in lint_molab_urls(path.read_text(encoding="utf-8"), canonical):
            offenders.append(f"{path.relative_to(ROOT)}: {issue}")

    if offenders:
        print("check-molab-links failed:", file=sys.stderr)
        for entry in offenders:
            print(f"  - {entry}", file=sys.stderr)
        return 1

    print("check-molab-links ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
