"""Moran's I recipe helpers (tests only; not imported by molab notebooks)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from tests.squidpy_moran_recipes import MORAN_CACHE, docs_recipe_adata, read_moran_scores


def test_docs_recipe_has_n_counts_and_moran_cache() -> None:
    adata = docs_recipe_adata()
    assert "n_counts" in adata.obs.columns
    scores = read_moran_scores(MORAN_CACHE)
    assert scores is not None
    assert scores.shape[0] == adata.n_vars
    assert not scores["moran_I_all"].isna().all()


def test_apob_stays_high_within_enterocytes() -> None:
    scores = read_moran_scores(MORAN_CACHE)
    assert scores is not None
    apob = scores.loc["Apob"]
    ent_top = scores["moran_I_enterocyte"].nlargest(20)
    assert "Apob" in ent_top.index
    assert float(apob["moran_I_all"]) > 0.5
    assert float(apob["moran_I_enterocyte"]) > 0.4


def test_erbb3_drops_within_enterocytes() -> None:
    scores = read_moran_scores(MORAN_CACHE)
    assert scores is not None
    erbb3 = scores.loc["Erbb3"]
    drop = float(erbb3["moran_I_all"]) - float(erbb3["moran_I_enterocyte"])
    assert drop > 0.3
