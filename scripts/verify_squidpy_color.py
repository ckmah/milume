#!/usr/bin/env python3
"""Re-run the squidpy_color recipe headlessly and assert numbers.json matches."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECIPE = ROOT / "demos" / "recipes" / "squidpy_color.py"
COMMITTED = ROOT / "demos" / "recipes" / "squidpy_color" / "numbers.json"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--regen",
        action="store_true",
        help="Print the generated JSON to stdout (for refreshing numbers.json).",
    )
    args = p.parse_args()

    if not RECIPE.is_file():
        print(f"missing recipe {RECIPE}", file=sys.stderr)
        return 1

    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".json",
        delete=False,
        encoding="utf-8",
    ) as tmp:
        tmp_path = Path(tmp.name)

    env = {**os.environ, "MILUME_RECIPE_NUMBERS_OUT": str(tmp_path), "MILUME_RECIPE_WRITE_NUMBERS": "1"}
    proc = subprocess.run(
        [sys.executable, str(RECIPE)],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(proc.stdout, file=sys.stderr)
        print(proc.stderr, file=sys.stderr)
        return proc.returncode or 1

    if not tmp_path.is_file():
        print("verify-squidpy-color: no numbers file was written", file=sys.stderr)
        return 1

    generated = _load_json(tmp_path)
    tmp_path.unlink(missing_ok=True)

    if args.regen:
        print(json.dumps(generated, indent=2, sort_keys=True))
        return 0

    if not COMMITTED.is_file():
        print(f"missing committed {COMMITTED}", file=sys.stderr)
        return 1

    committed = _load_json(COMMITTED)
    if committed != generated:
        print("verify-squidpy-color: numbers.json is stale", file=sys.stderr)
        print("--- committed", file=sys.stderr)
        print(json.dumps(committed, indent=2, sort_keys=True), file=sys.stderr)
        print("--- generated", file=sys.stderr)
        print(json.dumps(generated, indent=2, sort_keys=True), file=sys.stderr)
        return 1

    print("verify-squidpy-color: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
