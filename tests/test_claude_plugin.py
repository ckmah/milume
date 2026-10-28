"""Claude Code plugin marketplace metadata stays valid and in sync."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKETPLACE = ROOT / ".claude-plugin" / "marketplace.json"
PLUGIN = ROOT / ".claude-plugin" / "plugin.json"
SKILL = ROOT / "skills" / "use-milume" / "SKILL.md"
PACKAGE_VERSION = re.search(
    r'__version__ = "([^"]+)"',
    (ROOT / "milume" / "__init__.py").read_text(encoding="utf-8"),
).group(1)


def test_marketplace_and_plugin_layout():
    marketplace = json.loads(MARKETPLACE.read_text(encoding="utf-8"))
    manifest = json.loads(PLUGIN.read_text(encoding="utf-8"))

    assert marketplace["name"] == "milume"
    assert marketplace["owner"]["name"] == "ckmah"
    (entry,) = marketplace["plugins"]
    assert entry["name"] == "use-milume"
    assert entry["source"] == "."

    assert manifest["name"] == entry["name"]
    assert manifest["version"] == PACKAGE_VERSION
    assert manifest["skills"] == ["./skills/use-milume/"]
    assert SKILL.is_file()


def test_claude_plugin_validate():
    claude = shutil.which("claude")
    if claude is None:
        prefix = Path("/workspace/.local/npm-global/bin/claude")
        claude = str(prefix) if prefix.is_file() else None
    if claude is None:
        return

    out = subprocess.run(
        [claude, "plugin", "validate", str(ROOT)],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )
    assert out.returncode == 0, out.stdout + out.stderr
    assert "Validation passed" in out.stdout + out.stderr
