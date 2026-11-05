#!/usr/bin/env python3
"""Recompute ileum niche cache, assert committed parquet, print page statistics."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from pandas.testing import assert_frame_equal

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.ileum_niche_recipe_science import (  # noqa: E402
    CACHE_PATH,
    attach_cached_niches,
    compute_niche_dataframe,
    page_contrast_stats,
    print_verify_report,
)


def main() -> int:
    import milume as ml

    if not CACHE_PATH.is_file():
        raise SystemExit(f"missing cache {CACHE_PATH}")

    ileum = ROOT / "demos" / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum if ileum.is_file() else None)

    fresh = compute_niche_dataframe(adata.copy())
    committed = pd.read_parquet(CACHE_PATH)
    assert_frame_equal(
        fresh.sort_index(axis=1).sort_index(),
        committed.sort_index(axis=1).sort_index(),
        check_dtype=False,
    )

    attach_cached_niches(adata)
    stats = page_contrast_stats(adata)
    print_verify_report(stats)

    k15 = stats["k15_galt_majority"]
    if not (280 <= k15.niche_cells <= 360):
        raise SystemExit(f"k15 GALT-majority niche size {k15.niche_cells} outside ~321 sanity band")
    if k15.galt_share < 0.88:
        raise SystemExit(f"k15 GALT share {k15.galt_share:.3f} below ~93% sanity")
    print("verify_ileum_niche_recipe: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
