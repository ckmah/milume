"""Shared Squidpy niche cache + recipe page statistics (ileum GALT follicle pilot)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
NICHE_KS = (8, 30)
RESOLUTIONS = (0.3,)
DEFAULT_RES = 0.3
CACHE_PATH = ROOT / "demos" / "data" / "ileum_niche_recipe_niches.parquet"

# GALT/follicle selection (issue #414): one spatially compact component of
# ``niche_k30_res0.3`` id 2 (123 cells, high GALT); display polygon buffers that blob.
# fmt: off
GALT_FOLLICLE_POINT_INDICES: tuple[int, ...] = (
    20192, 20223, 20230, 20241, 20274, 20296, 20325, 20326, 20340, 20343, 20387, 20391,
    20425, 20439, 20459, 20466, 20493, 20507, 20525, 20546, 20560, 20563, 20587, 20591,
    20609, 20614, 20620, 20631, 20645, 20650, 20656, 20663, 20669, 20672, 20703, 20706,
    20709, 20730, 20751, 20763, 20769, 20785, 20815, 20822, 20823, 20829, 20834, 20866,
    20877, 20903, 20922, 20923, 20927, 20928, 20929, 20943, 20951, 20968, 20983, 20990,
    20996, 21006, 21013, 21015, 21040, 21047, 21055, 21064, 21066, 21083, 21090, 21099,
    21105, 21121, 21123, 21135, 21136, 21147, 21152, 21162, 21168, 21176, 21195, 21207,
    21221, 21226, 21231, 21245, 21282, 21341, 22402, 22442, 22593, 22808, 22818, 23316,
    23561, 23568, 23615, 23824, 23975, 24553, 24619, 24880, 25092, 25555, 25678, 25755,
    25987, 26574, 27029, 27331, 27497, 28140, 28158, 28220, 28484, 29174, 29774, 29900,
    29952, 30136, 30258,
)

GALT_FOLLICLE_LASSO_VERTICES: list[list[float]] = [
    [-3035.75, 1665.44], [-3040.99, 1663.56], [-3047.06, 1668.19], [-3050.8, 1669.18],
    [-3052.45, 1673.53], [-3055.85, 1672.06], [-3059.15, 1673.43], [-3060.52, 1676.73],
    [-3058.82, 1680.34], [-3063.46, 1691.55], [-3061.21, 1695.54], [-3062.49, 1699.22],
    [-3060.8, 1702.38], [-3054.98, 1703.11], [-3054.25, 1706.42], [-3051.72, 1708.3],
    [-3046.6, 1706.59], [-3045.6, 1708.93], [-3048.98, 1709.65], [-3050.86, 1712.18],
    [-3049.35, 1717.15], [-3043.79, 1717.42], [-3041.8, 1714.45], [-3042.75, 1710.6],
    [-3039.37, 1709.88], [-3038.55, 1715.35], [-3033.74, 1716.9], [-3034.78, 1720.21],
    [-3039.32, 1722.23], [-3039.8, 1726.51], [-3042.22, 1728.35], [-3042.99, 1731.4],
    [-3041.64, 1734.25], [-3038.79, 1735.6], [-3029.82, 1733.35], [-3026.94, 1742.31],
    [-3031.86, 1744.44], [-3031.86, 1749.63], [-3027.98, 1751.71], [-3023.81, 1749.15],
    [-3018.26, 1749.31], [-3015.14, 1754.17], [-3011.83, 1755.54], [-3008.52, 1754.17],
    [-3007.16, 1750.76], [-2999.11, 1750.14], [-2996.55, 1753.99], [-2990.05, 1758.57],
    [-2985.98, 1756.88], [-2985.14, 1752.51], [-2981.78, 1752.1], [-2979.75, 1749.95],
    [-2976.97, 1753.32], [-2972.58, 1752.89], [-2970.52, 1749.46], [-2972.21, 1745.38],
    [-2976.09, 1744.41], [-2979.41, 1747.03], [-2976.43, 1742.0], [-2977.71, 1737.79],
    [-2981.93, 1736.51], [-2987.34, 1729.55], [-2992.44, 1730.01], [-2994.94, 1728.73],
    [-2992.54, 1726.26], [-2992.38, 1723.11], [-2997.85, 1719.12], [-2992.08, 1718.46],
    [-2990.02, 1714.11], [-2991.37, 1711.26], [-2995.34, 1709.95], [-2996.38, 1707.91],
    [-2992.91, 1706.98], [-2990.84, 1711.07], [-2986.46, 1711.51], [-2983.74, 1713.71],
    [-2977.76, 1712.64], [-2979.98, 1715.84], [-2982.66, 1714.65], [-2985.72, 1715.42],
    [-2987.79, 1719.3], [-2985.72, 1723.19], [-2981.58, 1723.71], [-2982.19, 1732.95],
    [-2977.71, 1736.27], [-2973.39, 1733.38], [-2971.33, 1727.27], [-2971.62, 1723.04],
    [-2968.78, 1724.08], [-2965.95, 1727.67], [-2961.57, 1727.24], [-2959.51, 1723.81],
    [-2960.59, 1720.35], [-2956.27, 1719.67], [-2953.82, 1715.22], [-2949.54, 1713.95],
    [-2948.19, 1711.1], [-2948.96, 1708.05], [-2954.2, 1706.17], [-2956.73, 1708.05],
    [-2957.5, 1710.98], [-2958.71, 1710.88], [-2957.26, 1708.34], [-2957.6, 1704.43],
    [-2959.94, 1702.32], [-2963.08, 1702.16], [-2966.5, 1706.97], [-2963.73, 1711.7],
    [-2966.07, 1715.53], [-2970.91, 1715.31], [-2973.01, 1712.64], [-2970.91, 1709.98],
    [-2971.09, 1706.77], [-2968.52, 1705.18], [-2967.51, 1701.53], [-2965.02, 1699.36],
    [-2964.67, 1695.8], [-2967.36, 1692.84], [-2971.47, 1693.1], [-2973.93, 1689.28],
    [-2978.09, 1689.17], [-2977.52, 1685.87], [-2979.14, 1683.16], [-2984.31, 1682.66],
    [-2986.73, 1687.42], [-2989.36, 1689.0], [-2990.98, 1684.48], [-2999.94, 1681.04],
    [-3001.78, 1675.71], [-3005.29, 1675.01], [-3009.11, 1677.17], [-3010.28, 1672.51],
    [-3016.25, 1670.64], [-3020.14, 1672.72], [-3020.72, 1676.68], [-3017.61, 1679.79],
    [-3011.21, 1679.83], [-3011.99, 1682.59], [-3014.48, 1680.76], [-3017.63, 1680.91],
    [-3019.97, 1683.03], [-3020.53, 1686.08], [-3022.23, 1682.79], [-3026.11, 1681.82],
    [-3029.72, 1685.27], [-3032.62, 1683.79], [-3034.25, 1678.63], [-3030.83, 1675.2],
    [-3030.48, 1671.64], [-3034.98, 1668.32],
]
# fmt: on


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


def galt_follicle_lasso_mask(adata) -> pd.Series:
    """Cells in the tutorial GALT follicle selection (``point_indices`` in exports)."""
    n = adata.n_obs
    out = np.zeros(n, dtype=bool)
    idx = np.asarray(GALT_FOLLICLE_POINT_INDICES, dtype=np.int64)
    idx = idx[(idx >= 0) & (idx < n)]
    out[idx] = True
    return pd.Series(out, index=adata.obs_names)


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


def page_contrast_stats(adata) -> dict[str, NicheGaltSummary]:
    galt = anatomical_galt_mask(adata)
    lasso = galt_follicle_lasso_mask(adata)
    k30_niche = dominant_niche_in_lasso(adata, 30, lasso)
    k8_niche = dominant_niche_in_lasso(adata, 8, lasso)
    return {
        "k30_lasso_dominant": niche_galt_summary(adata, 30, k30_niche, galt),
        "k8_lasso_dominant": niche_galt_summary(adata, 8, k8_niche, galt),
    }


def format_intro_markdown(
    stats: dict[str, NicheGaltSummary],
    *,
    default_niche_color: str | None = None,
    niche_ks: tuple[int, ...] = NICHE_KS,
    resolution: float = DEFAULT_RES,
) -> str:
    k_lo = niche_ks[0]
    k_hi = niche_ks[-1]
    color_hi = default_niche_color or f"niche_k{k_hi}_res{resolution}"
    color_lo = f"niche_k{k_lo}_res{resolution}"
    k30 = stats["k30_lasso_dominant"]
    k8 = stats["k8_lasso_dominant"]
    k30_pct = k30.galt_share * 100
    return f"""# Squidpy neighborhood niches on ileum GALT

On this Xu 2026 ileum slice, does the gut-associated lymphoid tissue (GALT)
follicle come out as its own Squidpy niche, or dissolve into lamina propria?
**Neighborhood size `k`** in `sq.gr.spatial_neighbors` decides it. We cluster
with `groups="cell_type"` (cryptopatch / ILF-like cDC, ILC3, FRC aggregates,
not classical B/T zones).

The tutorial selection is a **compact `{color_hi}` blob** (follicle-like);
that niche is **{k30.niche_cells:,}** cells slice-wide (**{k30_pct:.1f}%** GALT in
`anatomical_layer`); **{k30.lasso_cells_in_niche:,}** of the selected cells share
that niche label. At **`{color_lo}`**, the selection maps to one
**{k8.niche_cells:,}**-cell niche with **{k8.galt_cells:,}** GALT cells
(**{k8.galt_share * 100:.0f}%**), so the follicle read merges into lamina propria.

**Open in molab:**
[squidpy_color.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_color.py)

> **Static docs view:** niches are **precomputed** and baked into the export.
> Switch between the two **`k`** niche columns (fixed Leiden resolution {resolution}) in
> the widget categorical tab (no kernel). The map shows the full slice zoomed to fit;
> focus the GALT selection in the layers list for a follicle crop. The composition figure matches
> **`{color_hi}`** and that selection.
"""


def print_verify_report(stats: dict[str, NicheGaltSummary]) -> None:
    k30 = stats["k30_lasso_dominant"]
    k8 = stats["k8_lasso_dominant"]
    print("ileum_niche_recipe verify:")
    print(
        f"  k30 res0.3 lasso-dominant niche {k30.niche_id}: "
        f"{k30.niche_cells} cells, {k30.galt_cells} GALT ({k30.galt_share * 100:.1f}%)"
    )
    print(
        f"  k8 res0.3 lasso-dominant (absorbing) niche {k8.niche_id}: "
        f"{k8.niche_cells} cells, {k8.galt_cells} GALT"
    )
