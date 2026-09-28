"""LandmarksWidget holds the caller's AnnData and packs genes once, at construct."""

from __future__ import annotations

import anndata as ad
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix

from tests.helpers import adata_xy


def _wide_sparse_adata(*, n_obs: int = 20, n_vars: int = 80):
    rng = np.random.default_rng(0)
    rows, cols, data = [], [], []
    for i in range(n_obs):
        for j in range(0, n_vars, 17):
            rows.append(i)
            cols.append(j)
            data.append(float((i + j) % 7))
    wide = csr_matrix((data, (rows, cols)), shape=(n_obs, n_vars), dtype=np.float32)
    obs = pd.DataFrame(
        {"label": ["a" if i % 2 == 0 else "b" for i in range(n_obs)]},
        index=[f"c{i}" for i in range(n_obs)],
    )
    var = pd.DataFrame(index=[f"g{j}" for j in range(n_vars)])
    out = ad.AnnData(X=wide, obs=obs, var=var)
    out.obsm["spatial"] = rng.normal(size=(n_obs, 2))
    return out


def test_constructor_does_not_copy_obs():
    from spatial_rx import LandmarksWidget

    adata = adata_xy([0.0, 1.0], [0.0, 1.0], color=["a", "b"])
    calls: list[int] = []
    original = adata.obs.copy

    def spy(*args, **kwargs):
        calls.append(1)
        return original(*args, **kwargs)

    adata.obs.copy = spy  # type: ignore[method-assign]
    LandmarksWidget(adata, color="label")
    assert calls == []


def test_choosing_active_genes_does_not_resend_the_matrix():
    from spatial_rx import LandmarksWidget

    w = LandmarksWidget(_wide_sparse_adata(), color="label")
    packed = (w.gene_values, w.gene_csc_indptr, w.gene_csc_indices, w.gene_csc_data)
    w.active_genes = ["g0", "g17"]
    assert (w.gene_values, w.gene_csc_indptr, w.gene_csc_indices, w.gene_csc_data) == packed
    assert w.color_by == "continuous"
