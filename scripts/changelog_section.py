#!/usr/bin/env python3
"""Print the GitHub release notes for one version from CHANGELOG.md.

The notes are the CHANGELOG section for VERSION (from its ``## VERSION`` heading up to
the next ``## `` heading, heading excluded), plus a ``**Full Changelog**`` compare link
from the previous ``v*`` tag when ``--tag`` is given. Exits non-zero when the section
is missing or empty, so a release is never created with empty notes.

    scripts/changelog_section.py 2.0.0 --tag v2.0.0 > notes.md
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO_URL = "https://github.com/ckmah/milume"
_VERSION = re.compile(r"^v?(\d+(?:\.\d+)*)(?:(a|b|rc)(\d+))?(?:\.?dev(\d+))?$")
_PRE_RANK = {"a": 0, "b": 1, "rc": 2}


class ChangelogError(Exception):
    pass


def section(text: str, version: str) -> str:
    """Return the body of the ``## <version>`` section, verbatim."""
    lines = text.splitlines(keepends=True)
    start = None
    for i, line in enumerate(lines):
        head = line.rstrip("\n")
        if head == f"## {version}" or head.startswith(f"## {version} "):
            start = i + 1
            break
    if start is None:
        raise ChangelogError(f"no '## {version}' section in CHANGELOG.md")
    end = next(
        (j for j in range(start, len(lines)) if lines[j].startswith("## ")), len(lines)
    )
    body = "".join(lines[start:end])
    if not body.strip():
        raise ChangelogError(f"the '## {version}' section in CHANGELOG.md is empty")
    return body


def version_key(tag: str):
    """Sort key for v* tags (PEP 440 subset: X.Y.Z[a|b|rcN][.devN]); None if unparseable."""
    m = _VERSION.match(tag)
    if not m:
        return None
    release = tuple(int(p) for p in m.group(1).split("."))
    release += (0,) * (4 - len(release))
    pre, pre_n, dev = m.group(2), m.group(3), m.group(4)
    # final > rc > b > a; .devN sorts before the same version without it.
    pre_key = (_PRE_RANK[pre], int(pre_n)) if pre else (3, 0)
    dev_key = (0, int(dev)) if dev is not None else (1, 0)
    return release, pre_key, dev_key


def is_prerelease(version: str) -> bool:
    m = _VERSION.match(version)
    return bool(m and (m.group(2) or m.group(4) is not None))


def previous_tag(tag: str, tags: list[str]) -> str | None:
    """Highest v* tag that sorts before ``tag``; tags that are not versions are ignored."""
    current = version_key(tag)
    if current is None:
        raise ChangelogError(f"{tag!r} is not a version tag")
    older = [
        (k, t)
        for t in tags
        if t.startswith("v") and (k := version_key(t)) is not None and k < current
    ]
    return max(older)[1] if older else None


def git_tags() -> list[str]:
    out = subprocess.run(
        ["git", "tag", "--list", "v*"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return out.stdout.split()


def notes(text: str, version: str, tag: str | None, tags: list[str]) -> str:
    body = section(text, version)
    if tag:
        prev = previous_tag(tag, tags)
        if prev:
            body = (
                body.rstrip("\n")
                + f"\n\n**Full Changelog**: {REPO_URL}/compare/{prev}...{tag}\n"
            )
    return body


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("version", help="version without the v prefix, e.g. 2.0.0")
    p.add_argument(
        "--tag", help="release tag (e.g. v2.0.0); adds the Full Changelog compare link"
    )
    p.add_argument("--changelog", type=Path, default=ROOT / "CHANGELOG.md")
    p.add_argument(
        "--is-prerelease", action="store_true", help="print true/false and exit"
    )
    args = p.parse_args(argv)
    if args.is_prerelease:
        print("true" if is_prerelease(args.version) else "false")
        return 0
    try:
        tags = git_tags() if args.tag else []
        sys.stdout.write(
            notes(
                args.changelog.read_text(encoding="utf-8"), args.version, args.tag, tags
            )
        )
    except ChangelogError as e:
        print(f"changelog_section: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
