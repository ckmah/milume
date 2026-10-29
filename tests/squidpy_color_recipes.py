"""Shared Squidpy → ``w.color`` recipe helpers (tests and doc fixtures)."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

if TYPE_CHECKING:
    import anndata as ad
    from milume.landmarks import LandmarksWidget

REPO_ROOT = Path(__file__).resolve().parents[1]
ILEUM_H5AD = REPO_ROOT / "demos" / "data" / "ileum.h5ad"
DOCS_RECIPE_PATCH_SIZE_UM = 800.0

NICHE_FLAVOR = "neighborhood"
NICHE_RESOLUTION = 0.5
NICHE_N_NEIGHBORS = 6


def niche_obs_key(resolution: float = NICHE_RESOLUTION) -> str:
    """Obs column Squidpy writes for ``flavor='neighborhood'`` at ``resolutions``."""
    return f"nhood_niche_res={resolution}"


def selection_mask(adata: ad.AnnData, w: LandmarksWidget, region: str) -> pd.Series:
    """Boolean mask aligned to ``adata.obs_names`` for ``calculate_niche(..., mask=)``."""
    return pd.Series(adata.obs_names.isin(w.get_obs_names(region)), index=adata.obs_names)


def run_niche_recipe(
    adata: ad.AnnData,
    w: LandmarksWidget,
    region: str,
    *,
    groups: str = "cell_type",
    resolution: float = NICHE_RESOLUTION,
    n_neighbors: int = NICHE_N_NEIGHBORS,
) -> str:
    """Run ``sq.gr.calculate_niche`` on a selection mask; return the niche obs key."""
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


def run_moran_top_gene(adata: ad.AnnData) -> str:
    """Run Moran's I and return the gene with the highest statistic."""
    import scanpy as sc
    import squidpy as sq

    if "spatial_connectivities" not in adata.obsp:
        sc.pp.neighbors(adata)
        sq.gr.spatial_neighbors_knn(adata, n_neighs=6)
    sq.gr.spatial_autocorr(adata, mode="moran")
    moran = adata.uns["moranI"]
    return str(moran["I"].idxmax())


def synthetic_recipe_adata(n: int = 120, seed: int = 0):
    """Small AnnData with spatial coords and a few genes for Squidpy recipes."""
    from tests.helpers import adata_xy

    rng = np.random.default_rng(seed)
    x = rng.uniform(0, 100, n)
    y = rng.uniform(0, 100, n)
    types = pd.Categorical(rng.choice(["enterocyte", "goblet", "stem"], n))
    genes = {g: rng.random(n) for g in ("APOB", "Lgr5", "Muc2")}
    return adata_xy(x, y, color=types, color_key="cell_type", genes=genes)


def docs_recipe_adata():
    """Xu 2026 ileum slice (2D tier) for the docs recipe export."""
    from demos.loaders.demo_tiers import load_2d_ileum_adata

    return load_2d_ileum_adata()


def docs_recipe_patch_selection(adata: ad.AnnData) -> dict[str, float | str]:
    """Rectangle selection centered on the slice median in spatial coordinates."""
    xy = adata.obsm["spatial"]
    cx, cy = (float(v) for v in np.median(xy, axis=0))
    size = DOCS_RECIPE_PATCH_SIZE_UM
    return {
        "id": "patch",
        "type": "rectangle",
        "cx": cx,
        "cy": cy,
        "width": size,
        "height": size,
        "angle": 0.0,
    }
