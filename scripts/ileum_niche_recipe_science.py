"""Shared Squidpy niche cache + recipe page statistics (ileum GALT follicle pilot)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
NICHE_KS = (8, 15, 30)
RESOLUTIONS = (0.3, 0.5, 1.0)
DEFAULT_RES = 0.3
CACHE_PATH = ROOT / "demos" / "data" / "ileum_niche_recipe_niches.parquet"

GALT_FOLLICLE_LASSO_VERTICES: list[list[float]] = [
    [-3992.68, 1334.9],
    [-4012.99, 1290.28],
    [-4011.83, 1279.79],
    [-4009.53, 1273.14],
    [-3989.17, 1253.08],
    [-3976.01, 1246.48],
    [-3969.55, 1247.26],
    [-3944.06, 1256.34],
    [-3905.74, 1270.34],
    [-3000.04, 1679.67],
    [-2969.14, 1697.16],
    [-2961.4, 1715.74],
    [-2964.16, 1723.35],
    [-2983.99, 1747.98],
    [-3459.14, 1949.51],
]


def niche_obs_columns() -> list[str]:
    cols: list[str] = []
    for k in NICHE_KS:
        for r in RESOLUTIONS:
            cols.append(f"niche_k{k}_res{r}")
    return cols


def _niche_neighborhood(adata, **kwargs):
    """Run Squidpy niche-neighborhood clustering across pinned versions.

    Squidpy 1.8.4+ (Python 3.12+): ``calculate_niche_neighborhood(..., rng=...)``.
    Squidpy 1.8.2 (Python 3.11): only ``calculate_niche(..., flavor='neighborhood', random_state=...)``.
    """
    import squidpy as sq

    fn = getattr(sq.gr, "calculate_niche_neighborhood", None)
    if fn is not None:
        return fn(adata, **kwargs)
    kw = {k: v for k, v in kwargs.items() if k != "rng"}
    kw["random_state"] = kwargs.get("rng", 0)
    return sq.gr.calculate_niche(adata, flavor="neighborhood", **kw)


def attach_cached_niches(adata, cache_path: Path = CACHE_PATH) -> None:
    cached = pd.read_parquet(cache_path)
    expected = niche_obs_columns()
    missing = [c for c in expected if c not in cached.columns]
    if missing:
        raise KeyError(f"cache missing columns: {missing}")
    for col in expected:
        adata.obs[col] = cached[col].astype("category")


def compute_niche_dataframe(adata) -> pd.DataFrame:
    import squidpy as sq

    frames: dict[str, pd.Series] = {}
    for k in NICHE_KS:
        sq.gr.spatial_neighbors(adata, coord_type="generic", n_neighs=k)
        _niche_neighborhood(
            adata,
            groups="cell_type",
            scale=False,
            n_neighbors=15,
            resolutions=list(RESOLUTIONS),
            rng=0,
        )
        for r in RESOLUTIONS:
            src = f"nhood_niche_res={r}"
            dst = f"niche_k{k}_res{r}"
            frames[dst] = adata.obs[src].astype(str).astype("category")
    return pd.DataFrame(frames, index=adata.obs_names)


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0 + 1e-12) + x0:
            inside = not inside
    return inside


def galt_follicle_lasso_mask(adata) -> pd.Series:
    spatial = adata.obsm["spatial"]
    return pd.Series(
        [
            point_in_ring(float(x), float(y), GALT_FOLLICLE_LASSO_VERTICES)
            for x, y in spatial
        ],
        index=adata.obs_names,
    )


def anatomical_galt_mask(adata) -> pd.Series:
    if "anatomical_layer" not in adata.obs.columns:
        raise KeyError("anatomical_layer missing from ileum adata")
    return adata.obs["anatomical_layer"].astype(str) == "GALT"


@dataclass(frozen=True)
class NicheGaltSummary:
    k: int
    resolution: float
    niche_id: str
    niche_cells: int
    galt_cells: int
    galt_share: float
    lasso_cells_in_niche: int


def _niche_column(adata, k: int, resolution: float = DEFAULT_RES) -> str:
    col = f"niche_k{k}_res{resolution}"
    if col not in adata.obs.columns:
        raise KeyError(col)
    return col


def dominant_niche_in_lasso(adata, k: int, lasso: pd.Series, resolution: float = DEFAULT_RES) -> str:
    col = _niche_column(adata, k, resolution)
    counts = adata.obs.loc[lasso, col].astype(str).value_counts()
    if counts.empty:
        raise ValueError(f"no lasso cells for k={k} res={resolution}")
    return str(counts.index[0])


def niche_galt_summary(adata, k: int, niche_id: str, galt: pd.Series, resolution: float = DEFAULT_RES) -> NicheGaltSummary:
    col = _niche_column(adata, k, resolution)
    in_niche = adata.obs[col].astype(str) == str(niche_id)
    niche_cells = int(in_niche.sum())
    galt_cells = int((in_niche & galt).sum())
    share = galt_cells / niche_cells if niche_cells else 0.0
    lasso = galt_follicle_lasso_mask(adata)
    lasso_in = int((in_niche & lasso).sum())
    return NicheGaltSummary(
        k=k,
        resolution=resolution,
        niche_id=str(niche_id),
        niche_cells=niche_cells,
        galt_cells=galt_cells,
        galt_share=share,
        lasso_cells_in_niche=lasso_in,
    )


def galt_majority_niche(adata, k: int, galt: pd.Series, resolution: float = DEFAULT_RES) -> NicheGaltSummary:
    """Largest niche cluster with GALT share at least 50% (reference sanity: k15 ~321 cells, ~93% GALT)."""
    col = _niche_column(adata, k, resolution)
    best: NicheGaltSummary | None = None
    for niche_id in adata.obs[col].astype(str).unique():
        summary = niche_galt_summary(adata, k, niche_id, galt, resolution)
        if summary.galt_share < 0.5:
            continue
        if best is None or summary.niche_cells > best.niche_cells:
            best = summary
    if best is None:
        raise ValueError(f"no GALT-majority niche at k={k} res={resolution}")
    return best


def page_contrast_stats(adata) -> dict[str, NicheGaltSummary]:
    galt = anatomical_galt_mask(adata)
    lasso = galt_follicle_lasso_mask(adata)
    k30_niche = dominant_niche_in_lasso(adata, 30, lasso)
    k8_niche = dominant_niche_in_lasso(adata, 8, lasso)
    return {
        "k30_lasso_dominant": niche_galt_summary(adata, 30, k30_niche, galt),
        "k15_galt_majority": galt_majority_niche(adata, 15, galt),
        "k8_lasso_dominant": niche_galt_summary(adata, 8, k8_niche, galt),
    }


def format_intro_markdown(stats: dict[str, NicheGaltSummary]) -> str:
    k30 = stats["k30_lasso_dominant"]
    k15 = stats["k15_galt_majority"]
    k8 = stats["k8_lasso_dominant"]
    k30_pct = k30.galt_share * 100
    k15_pct = k15.galt_share * 100
    return f"""# Squidpy neighborhood niches on ileum GALT

On this Xu 2026 ileum slice, does the gut-associated lymphoid tissue (GALT)
follicle come out as its own Squidpy niche, or dissolve into lamina propria?
**Neighborhood size `k`** in `sq.gr.spatial_neighbors` decides it. We cluster
with `groups="cell_type"` (cryptopatch / ILF-like cDC, ILC3, FRC aggregates,
not classical B/T zones).

At **`niche_k30_res0.3`**, the niche covering the tutorial lasso holds
**{k30.lasso_cells_in_niche:,}** of those cells; that niche is
**{k30.niche_cells:,}** cells slice-wide and **{k30_pct:.1f}%** annotated GALT
(`anatomical_layer`). At **`niche_k15_res0.3`**, the largest GALT-majority niche
is **{k15.niche_cells:,}** cells (**{k15_pct:.0f}%** GALT). At **`niche_k8_res0.3`**,
the lasso maps to one **{k8.niche_cells:,}**-cell niche with only
**{k8.galt_cells:,}** GALT cells (**{k8.galt_share * 100:.0f}%**), so the follicle
read merges into lamina propria.

**Open in molab:**
[squidpy_color.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_color.py)

> **Static docs view:** niches are **precomputed** and baked into the export.
> Switch **`k` / resolution** columns in the widget categorical tab (no kernel).
> The map is cropped to the follicle field of view below; molab loads the full slice.
> The composition figure matches **`niche_k30_res0.3`** and the tutorial lasso.
"""


def print_verify_report(stats: dict[str, NicheGaltSummary]) -> None:
    k30 = stats["k30_lasso_dominant"]
    k15 = stats["k15_galt_majority"]
    k8 = stats["k8_lasso_dominant"]
    print("ileum_niche_recipe verify:")
    print(
        f"  k30 res0.3 lasso-dominant niche {k30.niche_id}: "
        f"{k30.niche_cells} cells, {k30.galt_cells} GALT ({k30.galt_share * 100:.1f}%)"
    )
    print(
        f"  k15 res0.3 GALT-majority niche {k15.niche_id}: "
        f"{k15.niche_cells} cells, {k15.galt_cells} GALT ({k15.galt_share * 100:.1f}%)"
    )
    print(
        f"  k8 res0.3 lasso-dominant (absorbing) niche {k8.niche_id}: "
        f"{k8.niche_cells} cells, {k8.galt_cells} GALT"
    )
