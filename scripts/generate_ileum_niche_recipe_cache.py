#!/usr/bin/env python3
"""Precompute Squidpy niche columns for the ileum recipe (commit the parquet)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.ileum_niche_recipe_science import CACHE_PATH, compute_niche_dataframe  # noqa: E402


def compute_and_write(cache_path: Path = CACHE_PATH) -> None:
    import milume as ml

    ileum = ROOT / "demos" / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum if ileum.is_file() else None)
    out = compute_niche_dataframe(adata)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(cache_path)
    print(f"wrote {cache_path} ({cache_path.stat().st_size} bytes)")


if __name__ == "__main__":
    compute_and_write()
