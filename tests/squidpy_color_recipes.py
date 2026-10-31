"""Shared Squidpy recipe helpers for tests (not imported by molab notebooks)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
ILEUM_H5AD = REPO_ROOT / "demos" / "data" / "ileum.h5ad"

NICHE_FLAVOR = "neighborhood"
NICHE_RESOLUTION = 0.5
NICHE_N_NEIGHBORS = 6


def docs_recipe_adata():
    import milume as ml

    if ILEUM_H5AD.is_file():
        return ml.ds.ileum_merfish_xu2026(path=ILEUM_H5AD)
    return ml.ds.ileum_merfish_xu2026()


def niche_obs_key(resolution: float = NICHE_RESOLUTION) -> str:
    return f"nhood_niche_res={resolution}"


def selection_mask(adata, w, region: str) -> pd.Series:
    return pd.Series(adata.obs_names.isin(w.get_obs_names(region)), index=adata.obs_names)


def run_niche_recipe(
    adata,
    w,
    region: str,
    *,
    groups: str = "cell_type",
    resolution: float = NICHE_RESOLUTION,
    n_neighbors: int = NICHE_N_NEIGHBORS,
) -> str:
    import scanpy as sc
    import squidpy as sq

    sc.pp.neighbors(adata)
    sq.gr.spatial_neighbors_knn(adata, n_neighs=n_neighbors)
    sq.gr.calculate_niche(
        adata,
        flavor=NICHE_FLAVOR,
        groups=groups,
        n_neighbors=n_neighbors,
        resolutions=resolution,
        mask=selection_mask(adata, w, region),
    )
    key = niche_obs_key(resolution)
    if key not in adata.obs.columns:
        raise KeyError(key)
    return key


def synthetic_recipe_adata(n: int = 120, seed: int = 0):
    from tests.helpers import adata_xy

    rng = np.random.default_rng(seed)
    x = rng.uniform(0, 100, n)
    y = rng.uniform(0, 100, n)
    types = pd.Categorical(rng.choice(["enterocyte", "goblet", "stem"], n))
    genes = {g: rng.random(n) for g in ("APOB", "Lgr5", "Muc2")}
    return adata_xy(x, y, color=types, color_key="cell_type", genes=genes)


def run_moran_top_gene(adata):
    import scanpy as sc
    import squidpy as sq

    if "spatial_connectivities" not in adata.obsp:
        sc.pp.neighbors(adata)
        sq.gr.spatial_neighbors_knn(adata, n_neighs=6)
    sq.gr.spatial_autocorr(adata, mode="moran")
    moran = adata.uns["moranI"]
    return str(moran["I"].idxmax())
