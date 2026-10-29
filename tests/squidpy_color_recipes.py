"""Shared Squidpy recipe helpers for tests (implementation lives in ``demos/recipes/``)."""

from __future__ import annotations

from pathlib import Path

from demos.recipes import squidpy_color_helpers as _h

REPO_ROOT = Path(__file__).resolve().parents[1]
ILEUM_H5AD = REPO_ROOT / "demos" / "data" / "ileum.h5ad"
DOCS_RECIPE_PATCH_SIZE_UM = _h.DOCS_RECIPE_PATCH_SIZE_UM
NICHE_FLAVOR = _h.NICHE_FLAVOR
NICHE_RESOLUTION = _h.NICHE_RESOLUTION
NICHE_N_NEIGHBORS = _h.NICHE_N_NEIGHBORS

niche_obs_key = _h.niche_obs_key
selection_mask = _h.selection_mask
run_niche_recipe = _h.run_niche_recipe
run_moran_top_gene = _h.run_moran_top_gene
synthetic_recipe_adata = _h.synthetic_recipe_adata
docs_recipe_adata = _h.docs_recipe_adata
docs_recipe_patch_selection = _h.docs_recipe_patch_selection
