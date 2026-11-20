#!/usr/bin/env python3
"""Re-run the squidpy_color recipe headlessly and assert numbers.json matches."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECIPE = ROOT / "demos" / "recipes" / "squidpy_color.py"
COMMITTED = ROOT / "demos" / "recipes" / "squidpy_color" / "numbers.json"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _generate_numbers() -> dict:
    sys.path.insert(0, str(ROOT))
    import milume as ml

    from demos.recipes.squidpy_color_numbers import (
        DEFAULT_NICHE_COLOR,
        run_recipe_niches,
        rendered_numbers,
    )

    ileum = ROOT / "demos" / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum if ileum.is_file() else None)
    run_recipe_niches(adata)
    payload = rendered_numbers(adata)
    for k in payload["niche_ks"]:
        col = f"niche_k{k}"
        n_levels = int(adata.obs[col].nunique())
        if n_levels > 128:
            raise SystemExit(f"{col} has {n_levels} levels; widget cap is 128")
    if DEFAULT_NICHE_COLOR not in adata.obs:
        raise SystemExit(f"missing default color column {DEFAULT_NICHE_COLOR!r}")
    return payload


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

    proc = subprocess.run(
        [sys.executable, str(RECIPE)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(proc.stdout, file=sys.stderr)
        print(proc.stderr, file=sys.stderr)
        return proc.returncode or 1

    generated = _generate_numbers()

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