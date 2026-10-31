#!/usr/bin/env python3
"""Snapshot milume's public API and fail when it drifts (#260).

Public: ``milume.__all__`` (signatures), ``_PUBLIC_TRAITS`` (trait types and method
signatures). Internal: every other synced trait; reported, never gating.

    python scripts/public_api.py                  # live surface == .github/public-api.json
    python scripts/public_api.py --write          # rewrite the snapshot
    python scripts/public_api.py --base origin/main [--report r.md]
        # also: a public change vs the base snapshot needs a CHANGELOG line under unreleased
"""

from __future__ import annotations

import inspect
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / ".github" / "public-api.json"
SNAPSHOT_REL = ".github/public-api.json"

# ``color`` is a ColorSpec (str or list of gene names). ``active_*`` stay synced
# until 3.0 but are derived from ``color``.
_TRAIT_RECORD = {
    "color": "trait ColorSpec",
    "active_category": "deprecated trait Unicode",
    "active_genes": "deprecated trait List",
}


def _trait_record(name: str, trait: object) -> str:
    if name in _TRAIT_RECORD:
        return _TRAIT_RECORD[name]
    return f"trait {type(trait).__name__}"


def _sig(fn, drop_self: bool = False) -> str:
    sig = inspect.signature(fn)
    if drop_self:
        sig = sig.replace(parameters=list(sig.parameters.values())[1:])
    return str(sig)


def live() -> dict:
    sys.path.insert(0, str(ROOT))
    import milume
    from anywidget import AnyWidget
    from milume.landmarks import _PUBLIC_TRAITS, LandmarksWidget

    exports = {}
    for name in sorted(milume.__all__):
        obj = getattr(milume, name)
        if name == "__version__":
            exports[name] = "str"
        elif isinstance(obj, type):
            bases = ", ".join(b.__name__ for b in obj.__bases__)
            init = _sig(obj.__init__, drop_self=True) if "__init__" in vars(obj) else ""
            exports[name] = f"class({bases}){init}"
        elif inspect.ismodule(obj):
            exports[name] = "module"
        else:
            exports[name] = _sig(obj)

    traits = LandmarksWidget.class_traits()
    public = {}
    for name in _PUBLIC_TRAITS:
        if name in traits:
            public[name] = _trait_record(name, traits[name])
        else:
            public[name] = f"method {_sig(getattr(LandmarksWidget, name), drop_self=True)}"

    base = set(AnyWidget.class_trait_names(sync=True))
    internal = {
        n: f"trait {type(traits[n]).__name__}"
        for n in sorted(LandmarksWidget.class_trait_names(sync=True))
        if n not in base and n not in _PUBLIC_TRAITS and not n.startswith("_")
    }
    return {"public": {"exports": exports, "traits": public}, "internal": {"traits": internal}}


def diff(old: dict, new: dict) -> list[tuple[str, str, str]]:
    """(section, mark, line) with mark + added, - removed, ~ changed."""
    out = []
    for section, groups in (("public", ("exports", "traits")), ("internal", ("traits",))):
        for group in groups:
            a = old.get(section, {}).get(group, {})
            b = new.get(section, {}).get(group, {})
            for k in sorted(a.keys() | b.keys()):
                label = f"{group}.{k}"
                if k not in a:
                    out.append((section, "+", f"{label}: {b[k]}"))
                elif k not in b:
                    out.append((section, "-", f"{label}: {a[k]}"))
                elif a[k] != b[k]:
                    out.append((section, "~", f"{label}: {a[k]} -> {b[k]}"))
    return out


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=False).stdout


def changelog_has_unreleased_line(base: str) -> bool:
    text = (ROOT / "CHANGELOG.md").read_text().splitlines()
    start = next((i for i, l in enumerate(text) if re.match(r"^## .*\(unreleased\)", l)), None)
    if start is None:
        return False
    end = next((i for i in range(start + 1, len(text)) if text[i].startswith("## ")), len(text))
    added = set()
    for m in re.finditer(r"^@@ -\S+ \+(\d+)(?:,(\d+))? @@", _git("diff", "-U0", base, "--", "CHANGELOG.md"), re.M):
        first, count = int(m.group(1)), int(m.group(2) or 1)
        added.update(range(first - 1, first - 1 + count))
    return any(start < i < end and text[i].strip() for i in added)


def main(argv: list[str]) -> int:
    current = live()
    if "--write" in argv:
        SNAPSHOT.write_text(json.dumps(current, indent=2) + "\n")
        print(f"public-api: wrote {SNAPSHOT_REL}")
        return 0

    errors = []
    committed = json.loads(SNAPSHOT.read_text())
    stale = diff(committed, current)
    if stale:
        errors.append(
            f"{SNAPSHOT_REL} does not match the live API:\n"
            + "\n".join(f"  {m} [{s}] {l}" for s, m, l in stale)
            + "\nRun `npm run check:public-api -- --write`, and for public changes add a CHANGELOG.md line under the unreleased section."
        )

    changes = []
    if "--base" in argv:
        base = argv[argv.index("--base") + 1]
        raw = _git("show", f"{base}:{SNAPSHOT_REL}")
        changes = diff(json.loads(raw), committed) if raw else []
        if any(s == "public" for s, _, _ in changes) and not changelog_has_unreleased_line(base):
            errors.append("Public API changed but CHANGELOG.md has no new line under the unreleased section.")

    public = [f"{m} `{l}`" for s, m, l in changes if s == "public"]
    internal = [f"{m} `{l}`" for s, m, l in changes if s == "internal"]
    if "--report" in argv:
        parts = ["<!-- public-api-report -->", "### Public API check"]
        if public:
            parts += ["", "**Public API changed.** This PR stops for Clarence (`needs-clarence`).", ""] + [f"- {x}" for x in public]
        if internal:
            parts += ["", "Internal synced traits changed (not gating):", ""] + [f"- {x}" for x in internal]
        if errors:
            parts += ["", "**Failing:**", ""] + [f"- {e.splitlines()[0]}" for e in errors]
        Path(argv[argv.index("--report") + 1]).write_text("\n".join(parts) + "\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"public_changed={str(bool(public)).lower()}\ninternal_changed={str(bool(internal)).lower()}\n")

    for x in public:
        print(f"public-api: public {x}")
    for x in internal:
        print(f"public-api: internal {x}")
    if errors:
        for e in errors:
            print(f"public-api: {e}", file=sys.stderr)
        return 1
    print("public-api: ok (snapshot matches the live API)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
