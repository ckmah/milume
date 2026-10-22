"""The user changelog page lists every version that CHANGELOG.md and the package know about."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHANGELOG = ROOT / "CHANGELOG.md"
PAGE = ROOT / "website" / "content" / "changelog.md"
INIT = ROOT / "milume" / "__init__.py"

_VERSION_HEADING = re.compile(r"^## (\d+\.\d+\.\d+)\b(.*)$", re.MULTILINE)


def _changelog_versions() -> tuple[set[str], set[str]]:
    """Return (released, unreleased) versions from CHANGELOG.md headings."""
    released: set[str] = set()
    unreleased: set[str] = set()
    for version, rest in _VERSION_HEADING.findall(CHANGELOG.read_text(encoding="utf-8")):
        (unreleased if "unreleased" in rest.lower() else released).add(version)
    return released, unreleased


def _page_versions() -> set[str]:
    return {v for v, _ in _VERSION_HEADING.findall(PAGE.read_text(encoding="utf-8"))}


def _page_has_unreleased() -> bool:
    return re.search(r"^## Unreleased\b", PAGE.read_text(encoding="utf-8"), re.MULTILINE) is not None


def test_every_released_version_has_a_page_heading():
    released, _ = _changelog_versions()
    missing = sorted(released - _page_versions())
    assert not missing, (
        f"website/content/changelog.md has no '## X.Y.Z' heading for {missing}. "
        "Add a user-facing section for each release (see docs/publishing.md)."
    )


def _package_version() -> str:
    # Read the source, not `import milume`: the import needs the built widget bundle.
    match = re.search(r'^__version__ = "([^"]+)"', INIT.read_text(encoding="utf-8"), re.MULTILINE)
    assert match, "milume/__init__.py has no __version__"
    return match.group(1)


def test_package_version_has_a_page_heading():
    version = _package_version()
    assert version in _page_versions(), (
        f"website/content/changelog.md has no '## {version}' heading for "
        "milume.__version__. Release prep updates the user changelog (see docs/publishing.md)."
    )


def test_unreleased_changes_have_an_unreleased_section():
    _, unreleased = _changelog_versions()
    if unreleased:
        assert _page_has_unreleased(), (
            "CHANGELOG.md has an unreleased section but website/content/changelog.md "
            "has no '## Unreleased' heading."
        )


def test_unreleased_versions_are_not_listed_as_released():
    _, unreleased = _changelog_versions()
    early = sorted(unreleased & _page_versions())
    assert not early, f"website/content/changelog.md lists unreleased {early} as released."


def test_page_is_newest_first():
    versions = [v for v, _ in _VERSION_HEADING.findall(PAGE.read_text(encoding="utf-8"))]
    as_tuples = [tuple(int(p) for p in v.split(".")) for v in versions]
    assert as_tuples == sorted(as_tuples, reverse=True), versions
