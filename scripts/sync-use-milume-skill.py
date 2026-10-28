#!/usr/bin/env python3
"""Write the use-milume skill's Public API block from ``_PUBLIC_TRAITS``.

``--check`` exits 1 when the committed block differs from the registry.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "use-milume" / "SKILL.md"
BLOCK = re.compile(
    r"(<!-- BEGIN GENERATED: _PUBLIC_TRAITS \(scripts/sync-use-milume-skill.py\) -->\n)(.*?)(<!-- END GENERATED -->)",
    re.DOTALL,
)


def render() -> str:
    sys.path.insert(0, str(ROOT))
    from milume.landmarks import _PUBLIC_TRAITS, LandmarksWidget

    traits = LandmarksWidget.class_traits()
    lines = ["| Name | Kind | What it is |", "| --- | --- | --- |"]
    for name, doc in _PUBLIC_TRAITS.items():
        kind = "trait" if name in traits else "method"
        label = f"`w.{name}`" if kind == "trait" else f"`w.{name}()`"
        lines.append(f"| {label} | {kind} | {doc} |")
    return "\n".join(lines) + "\n"


def synced(text: str) -> str:
    if not BLOCK.search(text):
        raise SystemExit(f"generated block markers missing in {SKILL}")
    return BLOCK.sub(lambda m: m.group(1) + render() + m.group(3), text)


def main() -> None:
    text = SKILL.read_text(encoding="utf-8")
    new = synced(text)
    if "--check" in sys.argv[1:]:
        if new != text:
            print(
                f"{SKILL.relative_to(ROOT)} is out of date: run uv run python scripts/sync-use-milume-skill.py"
            )
            raise SystemExit(1)
        print("use-milume skill matches _PUBLIC_TRAITS")
        return
    SKILL.write_text(new, encoding="utf-8")


if __name__ == "__main__":
    main()
