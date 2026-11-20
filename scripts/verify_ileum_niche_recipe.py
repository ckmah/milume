#!/usr/bin/env python3
"""Recompute ileum niche columns and assert stable recipe parameters."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from demos.recipes.squidpy_color_numbers import (  # noqa: E402
    LEIDEN_RES,
    NICHE_KS,
    run_recipe_niches,
    rendered_numbers,
)


def main() -> int:
    import milume as ml

    ileum = ROOT / "demos" / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum if ileum.is_file() else None)
    run_recipe_niches(adata)
    stats = rendered_numbers(adata)
    print(
        f"verify_ileum_niche_recipe: n_obs={stats['adata_n_obs']:,}, "
        f"k={NICHE_KS}, leiden_res={LEIDEN_RES:g}"
    )
    for k in NICHE_KS:
        levels = stats[f"niche_k{k}_levels"]
        print(f"  niche_k{k}: {levels} Leiden clusters")
        if levels > 128:
            raise SystemExit(f"niche_k{k} has {levels} levels (widget cap 128)")
    print("verify_ileum_niche_recipe: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())