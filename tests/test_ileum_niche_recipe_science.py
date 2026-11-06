"""Fast tests for ileum niche recipe science helpers (no network)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from tests.helpers import adata_xy

REPO_ROOT = Path(__file__).resolve().parents[1]
SCIENCE_PATH = REPO_ROOT / "scripts" / "ileum_niche_recipe_science.py"


def _load_ileum_niche_recipe_science():
    spec = importlib.util.spec_from_file_location("ileum_niche_recipe_science_test", SCIENCE_PATH)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def science_mod():
    return _load_ileum_niche_recipe_science()


def test_niche_neighborhood_helper_writes_nhood_columns(science_mod):
    pytest.importorskip("squidpy")
    import squidpy as sq

    rng = np.random.default_rng(0)
    n = 80
    grid = int(np.ceil(np.sqrt(n)))
    xs = np.repeat(np.linspace(0.0, 10.0, grid), grid)[:n]
    ys = np.tile(np.linspace(0.0, 10.0, grid), grid)[:n]
    types = pd.Categorical(rng.choice(["a", "b", "c"], size=n))
    adata = adata_xy(xs, ys, color=types, color_key="cell_type")
    sq.gr.spatial_neighbors(adata, coord_type="generic", n_neighs=8)
    science_mod._niche_neighborhood(
        adata,
        groups="cell_type",
        scale=False,
        n_neighbors=15,
        resolutions=[0.3],
        rng=0,
    )
    assert "nhood_niche_res=0.3" in adata.obs.columns


def test_format_intro_markdown_k30_share_one_decimal(science_mod):
    """k=30 slice-wide GALT share must render with one decimal (e.g. 64.6%)."""
    NicheGaltSummary = science_mod.NicheGaltSummary
    md = science_mod.format_intro_markdown(
        {
            "k30_lasso_dominant": NicheGaltSummary(
                k=30,
                resolution=0.3,
                niche_id="2",
                niche_cells=537,
                galt_cells=347,
                galt_share=347 / 537,
                lasso_cells_in_niche=123,
            ),
            "k8_lasso_dominant": NicheGaltSummary(
                k=8,
                resolution=0.3,
                niche_id="4",
                niche_cells=2973,
                galt_cells=281,
                galt_share=281 / 2973,
                lasso_cells_in_niche=84,
            ),
        }
    )
    assert "**64.6%** GALT" in md and "`anatomical_layer`" in md
