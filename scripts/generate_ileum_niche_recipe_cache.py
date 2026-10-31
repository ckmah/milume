#!/usr/bin/env python3
"""Precompute Squidpy niche columns for the ileum recipe (commit the parquet)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

NICHE_KS = (8, 15, 30)
RESOLUTIONS = (0.3, 0.5, 1.0)
OUT = ROOT / "demos" / "data" / "ileum_niche_recipe_niches.parquet"


def _calculate_niche_neighborhood(sq, adata, **kwargs):
    fn = getattr(sq.gr, "calculate_niche_neighborhood", None)
    if fn is not None:
        return fn(adata, **kwargs)
    return sq.gr.calculate_niche(adata, flavor="neighborhood", **kwargs)


def niche_obs_columns() -> list[str]:
    cols: list[str] = []
    for k in NICHE_KS:
        for r in RESOLUTIONS:
            cols.append(f"niche_k{k}_res{r}")
    return cols


def attach_cached_niches(adata, cache_path: Path = OUT) -> None:
    import pandas as pd

    cached = pd.read_parquet(cache_path)
    expected = niche_obs_columns()
    missing = [c for c in expected if c not in cached.columns]
    if missing:
        raise KeyError(f"cache missing columns: {missing}")
    for col in expected:
        adata.obs[col] = cached[col].astype("category")


def compute_and_write(cache_path: Path = OUT) -> None:
    import milume as ml
    import pandas as pd
    import squidpy as sq

    ileum = ROOT / "demos" / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum if ileum.is_file() else None)
    frames: dict[str, pd.Series] = {}
    for k in NICHE_KS:
        sq.gr.spatial_neighbors(adata, coord_type="generic", n_neighs=k)
        _calculate_niche_neighborhood(
            sq,
            adata,
            groups="cell_type",
            scale=False,
            n_neighbors=15,
            resolutions=list(RESOLUTIONS),
            random_state=0,
        )
        for r in RESOLUTIONS:
            src = f"nhood_niche_res={r}"
            dst = f"niche_k{k}_res{r}"
            frames[dst] = adata.obs[src].astype(str).astype("category")
    out = pd.DataFrame(frames, index=adata.obs_names)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(cache_path)
    print(f"wrote {cache_path} ({cache_path.stat().st_size} bytes)")


if __name__ == "__main__":
    compute_and_write()
