from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from demos.recipes.squidpy_color_numbers import (
    LEIDEN_RES,
    NICHE_KS,
    run_recipe_niches,
)
from tests.helpers import adata_xy


def test_run_recipe_niches_writes_columns():
    pytest.importorskip("squidpy")
    rng = np.random.default_rng(0)
    n = 80
    grid = int(np.ceil(np.sqrt(n)))
    xs = np.repeat(np.linspace(0.0, 10.0, grid), grid)[:n]
    ys = np.tile(np.linspace(0.0, 10.0, grid), grid)[:n]
    types = pd.Categorical(rng.choice(["a", "b", "c"], size=n))
    adata = adata_xy(xs, ys, color=types, color_key="cell_type")
    run_recipe_niches(adata)
    for k in NICHE_KS:
        col = f"niche_k{k}"
        assert col in adata.obs.columns
        assert adata.obs[col].nunique() <= 128
    assert f"nhood_niche_res={LEIDEN_RES}" in adata.obs.columns