#!/usr/bin/env python3
"""Precompute Moran's I scores for the ileum recipe (commit the parquet)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

OUT = ROOT / "demos" / "data" / "ileum_moran_recipe_scores.parquet"
COLUMNS = ("moran_I_all", "moran_I_enterocyte")
HIGHLIGHT = ("Apob", "Acta2", "Grem1", "Erbb3")


def attach_cached_moran(adata, cache_path: Path = OUT) -> None:
    import pandas as pd

    cached = pd.read_parquet(cache_path)
    missing = [col for col in COLUMNS if col not in cached.columns]
    if missing:
        raise KeyError(f"cache missing columns: {missing}")
    for col in COLUMNS:
        adata.var[col] = cached[col]


def _expressed_gene_names(adata, min_fraction: float) -> list[str]:
    import numpy as np
    from scipy import sparse

    matrix = adata.X
    if sparse.issparse(matrix):
        detected = np.asarray((matrix > 0).sum(axis=0)).ravel()
    else:
        detected = np.count_nonzero(np.asarray(matrix), axis=0)
    keep = detected / adata.n_obs >= min_fraction
    return [str(name) for name in adata.var_names[keep]]


def _moran_I(sq, adata, genes: list[str] | None = None):
    sq.gr.spatial_neighbors_knn(adata, n_neighs=6, percentile=99)
    sq.gr.spatial_autocorr(adata, mode="moran", n_perms=100, rng=0, genes=genes)
    return adata.uns["moranI"]["I"]


def compute_and_write(cache_path: Path = OUT):
    import milume as ml
    import pandas as pd
    import squidpy as sq

    ileum = ROOT / "demos" / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum if ileum.is_file() else None)
    enterocytes = adata[adata.obs.cell_type.str.startswith("Enterocyte")].copy()
    enterocyte_genes = _expressed_gene_names(enterocytes, 0.05)

    scores = pd.DataFrame(index=adata.var_names)
    scores["moran_I_all"] = _moran_I(sq, adata)
    scores["moran_I_enterocyte"] = _moran_I(sq, enterocytes, enterocyte_genes)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    scores.to_parquet(cache_path)
    print(f"wrote {cache_path} ({cache_path.stat().st_size} bytes)")
    return scores, enterocyte_genes


def _gene_name(names, query: str) -> str:
    if query in names:
        return query
    folded = query.casefold()
    hits = [str(name) for name in names if str(name).casefold() == folded]
    if len(hits) != 1:
        raise KeyError(query)
    return hits[0]


def print_key_stats(scores, enterocyte_genes) -> None:
    top_all = scores["moran_I_all"].nlargest(20).index
    top_ent = scores["moran_I_enterocyte"].nlargest(20).index
    overlap = top_all.intersection(top_ent)
    print(f"n_genes={len(scores)}")
    print(f"n_enterocyte_genes={len(enterocyte_genes)}")
    print(f"top20_overlap={len(overlap)}")
    print("top20_overlap_genes=" + ",".join(str(name) for name in overlap))
    for query in HIGHLIGHT:
        gene = _gene_name(scores.index, query)
        all_i = float(scores.at[gene, "moran_I_all"])
        ent_i = float(scores.at[gene, "moran_I_enterocyte"])
        print(f"{gene} moran_I_all={all_i:.6f} moran_I_enterocyte={ent_i:.6f}")


if __name__ == "__main__":
    print_key_stats(*compute_and_write())
