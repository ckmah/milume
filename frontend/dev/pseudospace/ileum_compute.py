"""Ileum pseudospace showcase. Not a public API.

The slice has no drawn crypt or villus landmark. Paneth cells sit at the low end of
``mucosal_pseudospace`` and enterocytes (top) at the high end, so the fallback pair
is a line across the mucosa at each end of that axis.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.stats import spearmanr

REPO = Path(__file__).resolve().parents[3]
ILEUM = REPO / "demos" / "data" / "ileum.h5ad"
OUT = Path("/opt/cursor/artifacts/pseudospace/ileum-genes.png")
GENES = ("Apob", "Nt5e", "Cps1")


def _segment_distance(points: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ab = b - a
    den = float(np.dot(ab, ab)) or 1e-12
    t = np.clip(((points - a) @ ab) / den, 0, 1)
    proj = a + t[:, None] * ab
    return np.linalg.norm(points - proj, axis=1)


def end_lines(xy: np.ndarray, ps: np.ndarray, mucosa: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Two line segments across the mucosa, at the crypt and villus ends of the author axis."""
    fit = np.c_[ps[mucosa], np.ones(int(mucosa.sum()))]
    direction, _, _, _ = np.linalg.lstsq(fit, xy[mucosa], rcond=None)
    axis = direction[0]
    axis = axis / np.linalg.norm(axis)
    perp = np.array([-axis[1], axis[0]])
    proj = xy @ axis
    side = xy @ perp
    lo, hi = np.quantile(proj[mucosa], [0.06, 0.94])

    def segment(level: float) -> np.ndarray:
        near = mucosa & (np.abs(proj - level) <= (hi - lo) * 0.06)
        if int(near.sum()) < 8:
            near = mucosa & (np.abs(proj - level) <= (hi - lo) * 0.12)
        q0, q1 = np.quantile(side[near], [0.05, 0.95])
        return np.vstack([axis * level + perp * q0, axis * level + perp * q1])

    crypt, villus = segment(float(lo)), segment(float(hi))
    if float(np.mean(ps[mucosa & (np.abs(proj - lo) <= (hi - lo) * 0.08)])) > float(
        np.mean(ps[mucosa & (np.abs(proj - hi) <= (hi - lo) * 0.08)])
    ):
        crypt, villus = villus, crypt
    return crypt, villus


def geodesic_to_sources(xy: np.ndarray, sources: np.ndarray, graph) -> np.ndarray:
    """Graph distance to the nearest source cell. Sources are the landmark geometry."""
    from scipy.sparse import bmat, csr_matrix

    extra = csr_matrix(
        (np.full(len(sources), 1e-3), (sources, np.zeros(len(sources), dtype=int))),
        shape=(len(xy), 1),
    )
    joined = bmat([[graph, extra], [extra.T, None]], format="csr")
    dist = np.asarray(dijkstra(joined, directed=False, indices=len(xy)), dtype=float)[: len(xy)]
    return dist


def knn_graph(xy: np.ndarray, k: int = 8):
    tree = cKDTree(xy)
    dist, idx = tree.query(xy, k=k + 1)
    rows = np.repeat(np.arange(len(xy)), k)
    cols = idx[:, 1:].ravel()
    data = dist[:, 1:].ravel()
    graph = csr_matrix((data, (rows, cols)), shape=(len(xy), len(xy)))
    graph = graph.minimum(graph.T)
    return tree, graph


def field_from_lines(xy: np.ndarray, crypt: np.ndarray, villus: np.ndarray) -> np.ndarray:
    _tree, graph = knn_graph(xy)

    def sources(segment: np.ndarray) -> np.ndarray:
        eu = _segment_distance(xy, segment[0], segment[1])
        nearest = float(np.nanmin(eu))
        return np.flatnonzero(eu <= max(nearest * 1.25, nearest + 1e-6))

    d0 = geodesic_to_sources(xy, sources(crypt), graph)
    d1 = geodesic_to_sources(xy, sources(villus), graph)
    return d0 / (d0 + d1)


def field_from_sources(xy: np.ndarray, crypt_cells: np.ndarray, villus_cells: np.ndarray) -> np.ndarray:
    _tree, graph = knn_graph(xy)
    d0 = geodesic_to_sources(xy, crypt_cells, graph)
    d1 = geodesic_to_sources(xy, villus_cells, graph)
    return d0 / (d0 + d1)


def load_ileum():
    path = ILEUM
    try:
        import milume as ml

        return ml.ds.ileum_merfish_xu2026(path=path)
    except Exception:
        import anndata as ad

        return ad.read_h5ad(path)


def gene_vector(adata, name: str) -> np.ndarray:
    column = adata[:, [name]].X
    return np.asarray(column.toarray() if hasattr(column, "toarray") else column).ravel()


def binned_mean(ps: np.ndarray, values: np.ndarray, n: int = 12):
    edges = np.linspace(0, 1, n + 1)
    means = []
    centers = []
    for a, b in zip(edges[:-1], edges[1:]):
        mask = (ps >= a) & (ps <= b if b == 1 else ps < b)
        centers.append((a + b) / 2)
        means.append(float(values[mask].mean()) if mask.any() else np.nan)
    return np.array(centers), np.array(means)


def raster(xy: np.ndarray, values: np.ndarray, n: int = 160):
    lo = xy.min(axis=0)
    hi = xy.max(axis=0)
    xs = np.linspace(lo[0], hi[0], n)
    ys = np.linspace(lo[1], hi[1], n)
    grid = np.stack(np.meshgrid(xs, ys), axis=-1).reshape(-1, 2)
    tree = cKDTree(xy)
    dist, idx = tree.query(grid, k=4)
    radius = float(np.median(tree.query(xy, k=4)[0][:, 3])) * 1.75
    weight = 1 / (dist * dist + 0.05)
    filled = (weight * values[idx]).sum(axis=1) / weight.sum(axis=1)
    filled[dist[:, 0] > radius] = np.nan
    return xs, ys, filled.reshape(n, n)


def run() -> dict:
    adata = load_ileum()
    xy = np.asarray(adata.obsm["spatial"], dtype=float)
    ps = np.asarray(adata.obs["mucosal_pseudospace"], dtype=float)
    layers = list(adata.obs["anatomical_layer"].cat.categories)
    mucosa = np.asarray(adata.obs["anatomical_layer"].cat.codes) == layers.index("Mucosa")
    types = adata.obs["cell_type"].astype(str).to_numpy()
    crypt_cells = np.flatnonzero(types == "Paneth")
    villus_cells = np.flatnonzero(types == "Enterocyte (top)")
    value = field_from_sources(xy, crypt_cells, villus_cells)
    finite = np.isfinite(value) & np.isfinite(ps)
    rho_all = float(spearmanr(value[finite], ps[finite]).statistic)
    rho_mucosa = float(spearmanr(value[finite & mucosa], ps[finite & mucosa]).statistic)
    line_crypt, line_villus = end_lines(xy, ps, mucosa)
    line_value = field_from_lines(xy, line_crypt, line_villus)
    line_ok = mucosa & np.isfinite(line_value)
    rho_lines = float(spearmanr(line_value[line_ok], ps[line_ok]).statistic)

    import matplotlib.pyplot as plt

    xs, ys, image = raster(xy, value)
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.6), constrained_layout=True)
    field = axes[0].imshow(
        image,
        origin="lower",
        extent=[xs[0], xs[-1], ys[0], ys[-1]],
        cmap="coolwarm",
        vmin=0,
        vmax=1,
        interpolation="bilinear",
    )
    axes[0].set_title("knn pseudospace")
    axes[0].set_aspect("equal")
    axes[0].set_xticks([])
    axes[0].set_yticks([])
    fig.colorbar(field, ax=axes[0], fraction=0.046)
    for name in GENES:
        centers, means = binned_mean(value, gene_vector(adata, name))
        axes[1].plot(centers, means, label=name)
    axes[1].set_xlabel("pseudospace")
    axes[1].set_ylabel("mean log expression")
    axes[1].set_title(f"Spearman vs mucosal_pseudospace  mucosa {rho_mucosa:.2f}")
    axes[1].legend(frameon=False)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT, dpi=140)
    plt.close(fig)
    result = {
        "rho_mucosa": rho_mucosa,
        "rho_all": rho_all,
        "rho_lines": rho_lines,
        "n": int(len(xy)),
        "n_mucosa": int(mucosa.sum()),
        "plot": str(OUT),
    }
    print(result)
    return result


if __name__ == "__main__":
    run()
