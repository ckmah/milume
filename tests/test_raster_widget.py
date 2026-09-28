"""LandmarksWidget raster mode wiring (features build in the browser)."""

from __future__ import annotations

import base64

import numpy as np
import pytest

from tests.helpers import adata_xy


def test_raster_basis_follows_genes_embedding_and_composition():
    from spatial_rx import LandmarksWidget

    adata = adata_xy(
        [0.0, 0.2, 2.0, 2.1],
        [0.0, 0.1, 0.0, 2.0],
        color=["Epi", "Epi", "Imm", "Fib"],
        color_key="cell_class",
        genes={"Apob": [0.0, 2.0, 0.0, 4.0], "Lgr5": [1.0, 1.0, 0.0, 0.0]},
    )
    adata.obsm["X_pca"] = np.array(
        [[0.0, 1.0], [0.5, 1.0], [1.0, 0.0], [1.0, 0.5]], dtype=np.float32
    )
    w = LandmarksWidget(adata, color="cell_class", genes=["Apob", "Lgr5"])
    assert w.render_mode == "points"
    assert w.raster_basis == "composition"
    w.raster_bin_size = 1.0
    w.raster_window_radius = 2.0
    w.active_genes = ["Apob", "Lgr5"]
    assert w.raster_basis == "genes"
    w.set_raster_basis(genes="active")
    w.set_render_mode("raster")
    assert w.render_mode == "raster"
    assert w.raster_basis == "genes"
    # Bin features are built in the browser, never on the kernel (probe included).
    w.mode = "probe"
    assert w.raster_n_bins == 0
    assert w.raster_features == ""

    w.raster_query_bin = 0
    w.clear_raster_query()
    assert w.raster_query_bin == -1

    w.set_raster_basis(embedding="X_pca")
    assert w.raster_basis == "embedding"
    assert w.embedding_matrix_dim == 2
    raw = np.frombuffer(base64.b64decode(w.embedding_matrix), dtype=np.float32)
    assert raw.size == 4 * 2

    w.set_raster_basis(composition="cell_class")
    assert w.raster_basis == "composition"

    w.set_render_mode("points")
    assert w.render_mode == "points"


def test_raster_defaults_to_8_um_bins_and_24_um_window():
    from spatial_rx import LandmarksWidget

    adata = adata_xy(
        [0.0, 10.0, 20.0, 30.0],
        [0.0, 5.0, 10.0, 15.0],
        color=["A", "A", "B", "B"],
        color_key="cell_class",
        genes={"g1": [0.0, 1.0, 2.0, 3.0]},
    )
    w = LandmarksWidget(adata, color="cell_class", genes=["g1"])
    assert w.raster_bin_size == pytest.approx(8.0)
    assert w.raster_window_radius == pytest.approx(24.0)


def test_raster_discovers_embedding_keys():
    from spatial_rx import LandmarksWidget

    adata = adata_xy(
        [0.0, 1.0, 2.0, 3.0],
        [0.0, 0.5, 1.0, 1.5],
        color=["A", "A", "B", "B"],
        color_key="cell_class",
        genes={"g1": [0.0, 1.0, 2.0, 3.0]},
    )
    adata.obsm["X_umap"] = np.random.randn(4, 2).astype(np.float32)
    adata.obsm["X_pca"] = np.random.randn(4, 8).astype(np.float32)
    adata.obsm["spatial"] = np.column_stack(
        [adata.obsm["spatial"][:, 0], adata.obsm["spatial"][:, 1]]
    )
    w = LandmarksWidget(adata, color="cell_class", genes=["g1"])
    assert "X_pca" in w.raster_embedding_keys
    assert "X_umap" in w.raster_embedding_keys
    assert "spatial" not in w.raster_embedding_keys
    assert w.raster_embedding_key == "X_pca"
    assert w.embedding_matrix_dim == 8


def test_set_raster_basis_requires_one_kwarg():
    from spatial_rx import LandmarksWidget

    adata = adata_xy(
        [0.0, 1.0],
        [0.0, 1.0],
        color=["A", "B"],
        color_key="cell_class",
        genes={"g1": [0.0, 1.0]},
    )
    w = LandmarksWidget(adata, color="cell_class", genes=["g1"])
    with pytest.raises(ValueError, match="exactly one"):
        w.set_raster_basis(genes="active", embedding="X_pca")


def test_embedding_values_pack_for_point_rgb():
    """Selecting an embedding packs ≤3 display-normalized channels for points."""
    from spatial_rx import LandmarksWidget

    adata = adata_xy(
        [0.0, 0.2, 2.0, 2.1],
        [0.0, 0.1, 0.0, 2.0],
        color=["Epi", "Epi", "Imm", "Fib"],
        color_key="cell_class",
        genes={"g1": [0.0, 1.0, 2.0, 3.0]},
    )
    adata.obsm["X_pca"] = np.array(
        [[0.0, 1.0, 2.0], [0.5, 1.0, 0.0], [1.0, 0.0, 1.0], [1.0, 0.5, 0.5]],
        dtype=np.float32,
    )
    w = LandmarksWidget(adata, color="cell_class", genes=["g1"])
    assert w.raster_embedding_key == "X_pca"
    assert w.embedding_channel_labels == ["0", "1", "2"]
    packed = np.frombuffer(base64.b64decode(w.embedding_values), dtype=np.float32)
    assert packed.size == 4 * 3
    assert np.all(packed >= 0) and np.all(packed <= 1)
    assert w.embedding_matrix_dim == 3
    full = np.frombuffer(base64.b64decode(w.embedding_matrix), dtype=np.float32)
    assert full.size == 4 * 3


def test_empty_genes_keeps_gene_view_across_render_mode():
    """Clearing genes / flipping View must stay on genes, not fall back to category."""
    from spatial_rx import LandmarksWidget

    adata = adata_xy(
        [0.0, 0.2, 2.0, 2.1],
        [0.0, 0.1, 0.0, 2.0],
        color=["Epi", "Epi", "Imm", "Fib"],
        color_key="cell_class",
        genes={"Apob": [0.0, 2.0, 0.0, 4.0], "Lgr5": [1.0, 0.0, 1.0, 0.0]},
    )
    w = LandmarksWidget(adata, color="cell_class", genes=["Apob", "Lgr5"])
    w.active_genes = ["Apob"]
    assert w.color_by == "continuous"

    w.active_genes = []
    assert w.active_genes == []
    assert w.color_by == "continuous"

    w.set_render_mode("raster")
    assert w.render_mode == "raster"
    assert w.raster_basis == "genes"
    assert w.color_by == "continuous"

    w.set_render_mode("points")
    assert w.render_mode == "points"
    assert w.color_by == "continuous"
    assert w.raster_basis == "genes"
