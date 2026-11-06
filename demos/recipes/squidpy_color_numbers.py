"""Stable numeric facts for Squidpy niche recipe prose (single source of truth)."""

from __future__ import annotations

from demos.recipes import squidpy_color_helpers as h

# Geometry and dataset sizing (matches docs and tier notes).
DATASET_GENE_COUNT = 1_815
DATASET_CELL_COUNT = 30_332
PATCH_SIZE_UM = int(h.DOCS_RECIPE_PATCH_SIZE_UM)

# Squidpy / recipe parameters (allowlisted literals for prose lint).
NICHE_RESOLUTION = h.NICHE_RESOLUTION
NICHE_N_NEIGHBORS = h.NICHE_N_NEIGHBORS
