"""Pinned parameters and CI numbers for the squidpy_color recipe (not imported by the notebook)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

NICHE_KS = (8, 16, 64)
LEIDEN_RES = 0.3
N_NEIGHBORS = 15
NICHE_RNG = 0
DEFAULT_NICHE_COLOR = f"niche_k{NICHE_KS[-1]}"

GALT_POLYGONS: dict[str, tuple[tuple[float, float], ...]] = {
    "GALT 1": (
        (-3620.2, -125.98),
        (-3658.26, -112.54),
        (-3665.09, -107.44),
        (-3676.25, -98.46),
        (-3678.73, -73.95),
        (-3677.66, -65.59),
        (-3673.17, -51.78),
        (-3665.27, -39.7),
        (-3631.05, -31.14),
        (-3621.88, -35.79),
        (-3604.15, -47.5),
        (-3589.1, -65.9),
        (-3585.17, -73.5),
        (-3613.72, -121.79),
    ),
    "GALT 2": (
        (-3976.01, 1246.48),
        (-3989.17, 1253.08),
        (-4009.53, 1273.14),
        (-4011.83, 1279.79),
        (-4012.99, 1290.28),
        (-3992.68, 1334.9),
        (-3977.11, 1344.07),
        (-3950.67, 1356.98),
        (-3926.86, 1346.42),
        (-3894.02, 1330.06),
        (-3889.96, 1319.42),
        (-3898.3, 1283.95),
        (-3905.74, 1270.34),
        (-3944.06, 1256.34),
        (-3969.55, 1247.26),
    ),
    "GALT 3": (
        (-3034.12, 1667.94),
        (-3039.64, 1668.04),
        (-3055.85, 1676.73),
        (-3058.78, 1691.55),
        (-3057.83, 1698.77),
        (-3054.59, 1715.1),
        (-3027.98, 1747.03),
        (-2993.24, 1750.69),
        (-2983.99, 1747.98),
        (-2964.16, 1723.35),
        (-2961.4, 1715.74),
        (-2969.14, 1697.16),
        (-3000.04, 1679.67),
    ),
}


def run_recipe_niches(adata) -> None:
    """Match ``niche_sweep`` in ``demos/recipes/squidpy_color.py``."""
    import squidpy as sq

    for k in NICHE_KS:
        sq.gr.spatial_neighbors_knn(adata, n_neighs=k)
        sq.gr.calculate_niche_neighborhood(
            adata,
            groups="cell_type",
            scale=False,
            n_neighbors=N_NEIGHBORS,
            resolutions=LEIDEN_RES,
            rng=NICHE_RNG,
        )
        col = f"niche_k{k}"
        adata.obs[col] = adata.obs[f"nhood_niche_res={LEIDEN_RES}"].astype(str).astype("category")


def polygon_mask(adata, verts: tuple[tuple[float, float], ...]) -> Any:
    from matplotlib.path import Path as MplPath
    import numpy as np

    path = MplPath(verts)
    xy = np.asarray(adata.obsm["spatial"][:, :2], dtype=float)
    return path.contains_points(xy)


def rendered_numbers(adata) -> dict[str, Any]:
    import numpy as np

    levels = {f"niche_k{k}_levels": int(adata.obs[f"niche_k{k}"].nunique()) for k in NICHE_KS}
    galt = adata.obs["anatomical_layer"].astype(str).to_numpy() == "GALT"
    col = DEFAULT_NICHE_COLOR
    out: dict[str, Any] = {
        "adata_n_obs": int(adata.n_obs),
        "adata_n_vars": int(adata.n_vars),
        "default_niche_color": DEFAULT_NICHE_COLOR,
        "galt_polygon_count": len(GALT_POLYGONS),
        "leiden_res": LEIDEN_RES,
        "n_neighbors": N_NEIGHBORS,
        "niche_ks": list(NICHE_KS),
        "niche_rng": NICHE_RNG,
        "selection_count": 0,
        **levels,
    }
    for slug, verts in GALT_POLYGONS.items():
        key = slug.lower().replace(" ", "_")
        mask = polygon_mask(adata, verts)
        cells = int(np.asarray(mask, dtype=bool).sum())
        galt_n = int(np.logical_and(mask, galt).sum())
        pct = round(100.0 * galt_n / cells, 1) if cells else 0.0
        in_poly = adata.obs.loc[mask]
        top_domain = in_poly[col].astype(str).value_counts().index[0]
        top_domain_n = int(in_poly[col].astype(str).value_counts().iloc[0])
        top_ct = in_poly["cell_type"].astype(str).value_counts().index[0]
        top_ct_n = int(in_poly["cell_type"].astype(str).value_counts().iloc[0])
        out[f"{key}_cells"] = cells
        out[f"{key}_galt_cells"] = galt_n
        out[f"{key}_galt_percent"] = f"{pct:g}"
        out[f"{key}_top_domain_k64"] = str(top_domain)
        out[f"{key}_top_domain_k64_n"] = top_domain_n
        out[f"{key}_top_cell_type"] = str(top_ct)
        out[f"{key}_top_cell_type_n"] = top_ct_n
    return out


def write_numbers(adata, path: Path) -> dict[str, Any]:
    payload = rendered_numbers(adata)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return payload