import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "changelog_section.py"
spec = importlib.util.spec_from_file_location("changelog_section", SCRIPT)
cs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs)

CHANGELOG = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")


def test_real_changelog_2_0_0_section():
    body = cs.section(CHANGELOG, "2.0.0")
    assert body.lstrip().startswith("Breaking: no deprecation release.")
    assert "### Color is one trait" in body
    assert "\n## " not in body and not body.startswith("## ")
    assert "## 2.0.0" not in body


def test_real_changelog_2_0_0_notes_end_with_compare_link():
    tags = ["v1.3.4", "v1.3.5", "v2.0.0", "v2.0.1"]
    notes = cs.notes(CHANGELOG, "2.0.0", "v2.0.0", tags)
    assert notes.endswith(
        "\n\n**Full Changelog**: https://github.com/ckmah/milume/compare/v1.3.5...v2.0.0\n"
    )
    assert notes.startswith(cs.section(CHANGELOG, "2.0.0").rstrip("\n"))


def test_missing_version_fails():
    with pytest.raises(cs.ChangelogError, match="no '## 9.9.9' section"):
        cs.section(CHANGELOG, "9.9.9")
    run = subprocess.run(
        [sys.executable, str(SCRIPT), "9.9.9"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert run.returncode == 1
    assert run.stdout == ""
    assert "no '## 9.9.9' section" in run.stderr


def test_version_prefix_does_not_match_a_longer_version():
    text = "# Changelog\n\n## 2.0.0rc1\n\n- rc\n"
    with pytest.raises(cs.ChangelogError):
        cs.section(text, "2.0.0")


def test_empty_section_fails(tmp_path):
    path = tmp_path / "CHANGELOG.md"
    path.write_text(
        "# Changelog\n\n## 3.0.0 (2027-01-01)\n\n\n## 2.0.0\n\n- x\n", encoding="utf-8"
    )
    with pytest.raises(cs.ChangelogError, match="empty"):
        cs.section(path.read_text(), "3.0.0")
    run = subprocess.run(
        [sys.executable, str(SCRIPT), "3.0.0", "--changelog", str(path)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert run.returncode == 1 and run.stdout == ""


def test_previous_tag_uses_version_order_and_ignores_non_versions():
    tags = ["v1.10.0", "v1.9.0", "v2.0.0rc1", "v2.0.0", "v2.1.0", "vfoo"]
    assert cs.previous_tag("v2.0.0", tags) == "v2.0.0rc1"
    assert cs.previous_tag("v2.0.0rc1", tags) == "v1.10.0"
    assert cs.previous_tag("v1.10.0", tags) == "v1.9.0"
    assert cs.previous_tag("v1.9.0", tags) is None


@pytest.mark.parametrize(
    ("version", "pre"),
    [
        ("2.0.0", False),
        ("2.0.1", False),
        ("2.1.0a1", True),
        ("2.1.0b2", True),
        ("2.1.0rc1", True),
        ("2.1.0.dev3", True),
    ],
)
def test_is_prerelease(version, pre):
    assert cs.is_prerelease(version) is pre
