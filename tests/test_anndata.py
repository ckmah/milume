import numpy as np
import pandas as pd
import pytest
from scipy.sparse import csr_matrix

from tests.helpers import adata_xy


def _adata(n=4):
    import anndata as ad

    obs = pd.DataFrame(
        {
            "cell_type": pd.Categorical(["a", "b", "a", "c"][:n]),
            "cell_class": pd.Categorical(["X", "Y", "X", "Y"][:n]),
        },
        index=[f"c{i}" for i in range(n)],
    )
    X = np.arange(n * 2, dtype=float).reshape(n, 2)
    adata = ad.AnnData(X, obs=obs)
    adata.var_names = ["g1", "g2"]
    adata.obsm["spatial"] = np.column_stack(
        [np.arange(n, dtype=float), np.zeros(n)]
    )
    adata.uns["cell_type_colors"] = ["#111111", "#222222", "#333333"][
        : len(obs["cell_type"].cat.categories)
    ]
    adata.uns["cell_class_colors"] = ["#aaaaaa", "#bbbbbb"]
    return adata


def test_neighborhood_limits_need_no_obsp_graphs():
    from spatial_rx import LandmarksWidget

    adata = _adata()
    assert not adata.obsp
    w = LandmarksWidget(adata, color="cell_type")
    assert w.neighbor_k_max >= 1
    assert w.neighbor_radius_max > 0


def test_constructor_uses_uns_colors_and_packs_requested_genes():
    from spatial_rx import LandmarksWidget

    w = LandmarksWidget(_adata(), color="cell_type", genes=["g1"])
    assert w.legend_title == "cell_type"
    assert w.legend_labels == ["a", "b", "c"]
    assert w.point_palette == ["#111111", "#222222", "#333333"]
    assert [g["name"] for g in w.gene_columns] == ["g1"]
    assert w.gene_values


def test_rendering_controls_are_not_constructor_kwargs():
    from spatial_rx import LandmarksWidget

    adata = adata_xy([0.0, 1.0], [0.0, 0.0])
    with pytest.raises(TypeError):
        LandmarksWidget(adata, width=400)
    with pytest.raises(TypeError):
        LandmarksWidget(adata, point_size=2.0)


def test_selection_membership_is_written_to_obs_by_name():
    from spatial_rx import LandmarksWidget

    adata = _adata()
    w = LandmarksWidget(adata, color="cell_type")
    w.selections = [
        {
            "id": "selection 1",
            "type": "polygon",
            "vertices": [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
        }
    ]
    assert list(w.get_obs_names(adata, selection_id="selection 1")) == ["c0"]
    w.assign_obs_mask(adata, "in_sel", selection_id="selection 1")
    assert adata.obs["in_sel"].tolist() == [True, False, False, False]
    with pytest.raises(ValueError, match="row count"):
        w.get_obs_names(adata[["c0", "c2"]].copy(), selection_id="selection 1")


def test_write_obs_joins_scores_by_obs_name():
    from spatial_rx import write_obs

    adata = _adata()
    df = pd.DataFrame({"obs_name": ["c2", "c0"], "s": [0.9, 0.1]})
    write_obs(adata, df, "crypt_villus_s", "s")
    assert adata.obs.loc["c0", "crypt_villus_s"] == pytest.approx(0.1)
    assert adata.obs.loc["c2", "crypt_villus_s"] == pytest.approx(0.9)
    assert np.isnan(adata.obs.loc["c1", "crypt_villus_s"])


def test_set_neighbor_graphs_raises_a_removal_error():
    from spatial_rx import LandmarksWidget

    adata = _adata()
    w = LandmarksWidget(adata, color="cell_type")
    bad = csr_matrix((2, 2))
    with pytest.raises(RuntimeError, match="set_neighbor_graphs was removed"):
        w.set_neighbor_graphs(bad, bad)
