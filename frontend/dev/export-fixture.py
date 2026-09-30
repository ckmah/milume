#!/usr/bin/env python3
"""Regenerate frontend/dev/fixture.json from richer synthetic AnnData.

Multi-domain tissue-like cloud (~2k cells), several categories, correlated
genes, k-NN + radius graphs, and toy ``X_pca`` / ``X_umap`` embeddings so the
Vite harness can exercise chrome (including Embedding) without a notebook.

Spatial units are scaled to a typical imaging panel (~4.5 µm median NN) so the
fixed 10 µm raster bins have realistic cell density.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from spatial_rx import LandmarksWidget  # noqa: E402
from tests.helpers import adata_xy, graph  # noqa: E402

# Reference cell spacing (a MERFISH tissue section): median NN ≈ 4.5 µm,
# extent roughly x∈[2380,3910], y∈[140,1670]. Raster bin size is fixed at 8 µm.
REF_MEDIAN_NN = 4.5
REF_ORIGIN_X = 2400.0
REF_ORIGIN_Y = 140.0

# Keep aligned with LandmarksWidget synced traits used by the harness / engine.
FIXTURE_KEYS = [
    "mode",
    "selections",
    "landmarks",
    "selected_kind",
    "selected_index",
    "category_columns",
    "active_category",
    "gene_columns",
    "active_genes",
    "gene_scale_mode",
    "gene_log1p",
    "gene_expression_logged",
    "color_by",
    "legend_labels",
    "legend_title",
    "type_neighborhoods",
    "default_buffer_width",
    "neighbor_radius_max",
    "neighbor_k_max",
    "gene_format",
    "gene_csc_indptr",
    "gene_csc_indices",
    "gene_csc_data",
    "x_bounds",
    "y_bounds",
    "point_size",
    "points_data",
    "point_palette",
    "category_codes",
    "gene_values",
    "color_vmin",
    "color_vmax",
    "render_mode",
    "raster_bin_size",
    "raster_window_radius",
    "raster_basis",
    "raster_embedding_key",
    "raster_embedding_keys",
    "raster_embedding_dims",
    "embedding_values",
    "embedding_channel_labels",
    "embedding_matrix",
    "embedding_matrix_dim",
    "raster_obs_key",
    "raster_gene_mode",
    "raster_origin_x",
    "raster_origin_y",
    "raster_n_cols",
    "raster_n_rows",
    "raster_n_bins",
    "raster_bin_rows",
    "raster_bin_cols",
    "raster_bin_counts",
    "raster_features",
    "raster_feature_dim",
    "raster_feature_labels",
    "raster_query_bin",
    "raster_similarity_enabled",
    "raster_threshold",
    "raster_status",
]

# Domains in arbitrary layout units (rescaled to reference µm after sampling).
# (cx, cy, sx, sy, n_core, n_halo)
DOMAINS = [
    (2200, 500, 180, 140, 420, 80),
    (3100, 450, 200, 120, 380, 70),
    (3800, 900, 160, 180, 300, 60),
    (2600, 1200, 220, 160, 360, 90),
    (3400, 1400, 190, 150, 280, 70),
]

CELLTYPES = [
    "Stem",
    "Enterocyte",
    "Goblet",
    "Immune",
    "Fibroblast",
    "Endothelial",
]

DOMAIN_MIX = np.array(
    [
        [0.35, 0.40, 0.15, 0.05, 0.04, 0.01],
        [0.05, 0.10, 0.05, 0.45, 0.25, 0.10],
        [0.02, 0.03, 0.02, 0.70, 0.15, 0.08],
        [0.02, 0.05, 0.02, 0.15, 0.65, 0.11],
        [0.03, 0.05, 0.02, 0.35, 0.25, 0.30],
    ],
    dtype=np.float64,
)

GENES = [
    "Lgr5",
    "Alpi",
    "Muc2",
    "Cd3e",
    "Col1a1",
    "Pecam1",
    "Apob",
    "Cxcl13",
    "Acta2",
    "Hbb",
]

GENE_BY_TYPE = np.array(
    [
        [2.8, 0.2, 0.3, 0.1, 0.2, 0.1, 0.4, 0.2, 0.1, 0.0],
        [0.3, 2.6, 0.4, 0.1, 0.2, 0.1, 2.2, 0.1, 0.2, 0.0],
        [0.2, 0.4, 2.8, 0.1, 0.2, 0.1, 0.3, 0.2, 0.1, 0.0],
        [0.2, 0.2, 0.2, 2.7, 0.3, 0.2, 0.2, 2.0, 0.2, 0.1],
        [0.1, 0.2, 0.1, 0.2, 2.8, 0.2, 0.1, 0.2, 2.4, 0.0],
        [0.1, 0.1, 0.1, 0.2, 0.3, 2.7, 0.1, 0.2, 0.3, 0.8],
    ],
    dtype=np.float64,
)


def _sample_points(rng: np.random.Generator):
    xs: list[float] = []
    ys: list[float] = []
    types: list[str] = []
    compartments: list[str] = []
    domain_ids: list[int] = []

    for di, (cx, cy, sx, sy, n_core, n_halo) in enumerate(DOMAINS):
        mix = DOMAIN_MIX[di]
        for n, scale in ((n_core, 1.0), (n_halo, 1.85)):
            dx = rng.normal(0.0, sx * scale, size=n)
            dy = rng.normal(0.0, sy * scale, size=n)
            ridge = 40.0 * np.sin((dx + di * 80.0) / 120.0)
            for i in range(n):
                xs.append(float(cx + dx[i]))
                ys.append(float(cy + dy[i] + ridge[i]))
                ti = int(rng.choice(len(CELLTYPES), p=mix))
                types.append(CELLTYPES[ti])
                if cy < 700:
                    compartments.append("mucosa")
                elif cy < 1100:
                    compartments.append("submucosa")
                else:
                    compartments.append("muscle")
                domain_ids.append(di)

    return (
        np.asarray(xs, dtype=np.float64),
        np.asarray(ys, dtype=np.float64),
        types,
        compartments,
        np.asarray(domain_ids, dtype=np.int32),
    )


def _median_nn(x: np.ndarray, y: np.ndarray) -> float:
    pts = np.column_stack([x, y])
    dist, _ = cKDTree(pts).query(pts, k=2)
    return float(np.median(dist[:, 1]))


def _scale_to_reference(
    x: np.ndarray, y: np.ndarray
) -> tuple[np.ndarray, np.ndarray, float]:
    """Uniform scale + translate so median NN and origin match the reference µm units."""
    nn = _median_nn(x, y)
    scale = REF_MEDIAN_NN / max(nn, 1e-9)
    xs = (x - float(x.min())) * scale + REF_ORIGIN_X
    ys = (y - float(y.min())) * scale + REF_ORIGIN_Y
    return xs, ys, scale


def _expression(
    rng: np.random.Generator, types: list[str], x: np.ndarray, y: np.ndarray
) -> dict[str, list[float]]:
    type_idx = np.array([CELLTYPES.index(t) for t in types], dtype=np.int32)
    means = GENE_BY_TYPE[type_idx].copy()
    x_norm = (x - x.min()) / max(float(np.ptp(x)), 1.0)
    y_norm = (y - y.min()) / max(float(np.ptp(y)), 1.0)
    means[:, GENES.index("Apob")] += 0.8 * x_norm
    means[:, GENES.index("Cxcl13")] += 0.9 * (1.0 - y_norm)
    noise = rng.normal(0.0, 0.35, size=means.shape)
    raw = np.clip(means + noise, 0.0, None)
    vals = np.log1p(raw)
    vals /= vals.max(axis=0, keepdims=True).clip(min=1e-6)
    return {g: vals[:, i].astype(np.float64).tolist() for i, g in enumerate(GENES)}


def _toy_embeddings(
    rng: np.random.Generator,
    types: list[str],
    domain_ids: np.ndarray,
    x: np.ndarray,
    y: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    n = len(types)
    type_idx = np.array([CELLTYPES.index(t) for t in types], dtype=np.int32)
    centers = rng.normal(0.0, 1.0, size=(len(CELLTYPES), 8))
    pca = centers[type_idx] + rng.normal(0.0, 0.35, size=(n, 8))
    pca[:, 0] += 0.15 * ((x - x.mean()) / max(float(x.std()), 1.0))
    pca[:, 1] += 0.15 * ((y - y.mean()) / max(float(y.std()), 1.0))
    pca[:, 2] += 0.25 * domain_ids.astype(np.float64)

    angles = (2 * np.pi * type_idx / len(CELLTYPES)) + rng.normal(0, 0.12, size=n)
    radii = 1.2 + 0.35 * (type_idx % 3) + rng.normal(0, 0.08, size=n)
    umap = np.column_stack([radii * np.cos(angles), radii * np.sin(angles)])
    umap += 0.05 * np.column_stack(
        [
            (x - x.mean()) / max(float(x.std()), 1.0),
            (y - y.mean()) / max(float(y.std()), 1.0),
        ]
    )
    return pca.astype(np.float32), umap.astype(np.float32)


def _neighbor_graphs(
    x: np.ndarray, y: np.ndarray, *, k: int = 12, radius: float
):
    pts = np.column_stack([x, y])
    tree = cKDTree(pts)
    knn_dist, knn_idx = tree.query(pts, k=k + 1)
    pairs: list[tuple[int, int, float]] = []
    n = len(x)
    for i in range(n):
        for jj in range(1, k + 1):
            j = int(knn_idx[i, jj])
            d = float(knn_dist[i, jj])
            if np.isfinite(d):
                pairs.append((i, j, d))
    knn = graph(n, pairs)

    radius_pairs: list[tuple[int, int, float]] = []
    neighbors = tree.query_ball_point(pts, r=radius)
    for i, js in enumerate(neighbors):
        for j in js:
            if j == i:
                continue
            d = float(np.hypot(x[i] - x[j], y[i] - y[j]))
            radius_pairs.append((i, int(j), d))
    return knn, graph(n, radius_pairs)


def _map_xy(x: float, y: float, *, x0: float, y0: float, scale: float) -> list[float]:
    return [
        (x - x0) * scale + REF_ORIGIN_X,
        (y - y0) * scale + REF_ORIGIN_Y,
    ]


def main() -> None:
    rng = np.random.default_rng(7)
    x_raw, y_raw, types, compartments, domain_ids = _sample_points(rng)
    n = len(x_raw)
    x0, y0 = float(x_raw.min()), float(y_raw.min())
    x, y, scale = _scale_to_reference(x_raw, y_raw)
    nn = _median_nn(x, y)
    # ~10× median NN, matching prior graph density (160 / 15 ≈ 10).
    radius = 10.0 * REF_MEDIAN_NN

    genes = _expression(rng, types, x, y)
    knn, radius_g = _neighbor_graphs(x, y, k=12, radius=radius)

    adata = adata_xy(
        x,
        y,
        color=types,
        color_key="celltype",
        genes=genes,
        knn=knn,
        radius=radius_g,
    )
    adata.obs["compartment"] = compartments
    pca, umap = _toy_embeddings(rng, types, domain_ids, x, y)
    adata.obsm["X_pca"] = pca
    adata.obsm["X_umap"] = umap

    widget = LandmarksWidget(adata, color="celltype", genes=GENES)
    # Preload genes + embeddings for chrome, but start in neutral widget defaults:
    # points view, categorical color, probe off, no pinned query bin.
    widget.active_genes = ["Lgr5", "Cd3e", "Col1a1"]
    widget.color_by = "categorical"
    widget.set_render_mode("points")
    widget.selections = [
        {
            "id": "lasso-mucosa",
            "type": "polygon",
            "vertices": [
                _map_xy(2000, 350, x0=x0, y0=y0, scale=scale),
                _map_xy(2500, 350, x0=x0, y0=y0, scale=scale),
                _map_xy(2500, 700, x0=x0, y0=y0, scale=scale),
                _map_xy(2000, 700, x0=x0, y0=y0, scale=scale),
            ],
            "neighborhood": "radius",
            "neighborhood_radius": 90.0 * scale,
        },
        {
            "id": "lasso-immune",
            "type": "polygon",
            "vertices": [
                _map_xy(3600, 700, x0=x0, y0=y0, scale=scale),
                _map_xy(4000, 700, x0=x0, y0=y0, scale=scale),
                _map_xy(4000, 1100, x0=x0, y0=y0, scale=scale),
                _map_xy(3600, 1100, x0=x0, y0=y0, scale=scale),
            ],
            "neighborhood": "knn",
            "neighborhood_k": 8,
        },
    ]
    widget.landmarks = [
        {
            "id": "crypt-1",
            "type": "point",
            "vertices": [_map_xy(2250, 480, x0=x0, y0=y0, scale=scale)],
        },
        {
            "id": "vessel-1",
            "type": "line",
            "vertices": [
                _map_xy(3200, 1300, x0=x0, y0=y0, scale=scale),
                _map_xy(3500, 1450, x0=x0, y0=y0, scale=scale),
                _map_xy(3750, 1380, x0=x0, y0=y0, scale=scale),
            ],
        },
    ]
    widget.selected_kind = ""
    widget.selected_index = -1
    if widget.raster_embedding_keys:
        widget.raster_embedding_dims = [0, 1, 2]
        # Ensure embedding RGB + full matrix pack for harness Color → embed / raster.
        if hasattr(widget, "_pack_embedding_values"):
            widget._pack_embedding_values()
        if hasattr(widget, "_pack_embedding_matrix"):
            widget._pack_embedding_matrix()
    # Keep composition basis aligned with categorical points boot.
    widget.raster_basis = "composition"
    widget.raster_similarity_enabled = False
    widget.raster_query_bin = -1

    out = Path(__file__).with_name("fixture.json")
    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS}
    out.write_text(json.dumps(payload, indent=2) + "\n")
    xb, yb = payload["x_bounds"], payload["y_bounds"]
    print(
        f"wrote {out} ({n} points, "
        f"{len(payload.get('raster_embedding_keys') or [])} embeddings, "
        f"embed_dim={payload.get('embedding_matrix_dim')}, "
        f"{out.stat().st_size / 1e6:.2f} MB)"
    )
    print(
        f"  scale={scale:.4f} median_nn={nn:.3f}µm "
        f"(target {REF_MEDIAN_NN}) bin={payload.get('raster_bin_size')} "
        f"window={payload.get('raster_window_radius')}"
    )
    print(
        f"  extent x=[{xb[0]:.1f},{xb[1]:.1f}] "
        f"y=[{yb[0]:.1f},{yb[1]:.1f}] "
        f"span={xb[1]-xb[0]:.1f}×{yb[1]-yb[0]:.1f}"
    )
    print(f"  embeddings: {payload.get('raster_embedding_keys')}")
    print(f"  genes: {[g['name'] for g in payload['gene_columns']]}")
    print(f"  categories: {[c['name'] for c in payload['category_columns']]}")


if __name__ == "__main__":
    main()
