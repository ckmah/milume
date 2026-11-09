"""Parameters and rendered numbers for the Squidpy niche recipe.

Prose cells interpolate these values with ``mo.md(f"...")``. ``numbers.json``
records the same figures the intro and sweep cells render.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_science():
    path = ROOT / "scripts" / "ileum_niche_recipe_science.py"
    if not path.is_file():
        raise FileNotFoundError(f"missing {path}")
    spec = importlib.util.spec_from_file_location("ileum_niche_recipe_science_numbers", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


_science = _load_science()

NICHE_KS = _science.NICHE_KS
NICHE_RESOLUTIONS = _science.RESOLUTIONS
DEFAULT_RES = _science.DEFAULT_RES
# Docs default is the larger neighborhood at the pinned resolution (k=30, res 0.3).
DEFAULT_NICHE_COLOR = f"niche_k{NICHE_KS[-1]}_res{DEFAULT_RES}"
# ``calculate_niche_neighborhood`` arguments in the recipe sweep cell.
NICHE_N_NEIGHBORS = 15
NICHE_RNG = 0


def color_key(value) -> str:
    if isinstance(value, (list, tuple)):
        return ",".join(str(x) for x in value if str(x))
    return "" if value is None else str(value)


def rendered_numbers(adata, *, color, selection_count: int) -> dict:
    """Figures the recipe prose prints, plus the widget state those stills assert."""
    stats = _science.page_contrast_stats(adata)
    k30 = stats["k30_lasso_dominant"]
    k8 = stats["k8_lasso_dominant"]
    return {
        "adata_n_obs": int(adata.n_obs),
        "adata_n_vars": int(adata.n_vars),
        "color": color_key(color),
        "default_niche_color": DEFAULT_NICHE_COLOR,
        "k30_galt_cells": k30.galt_cells,
        "k30_galt_percent": f"{k30.galt_share * 100:.1f}",
        "k30_lasso_cells_in_niche": k30.lasso_cells_in_niche,
        "k30_niche_cells": k30.niche_cells,
        "k30_niche_id": k30.niche_id,
        "k8_galt_cells": k8.galt_cells,
        "k8_galt_percent": f"{k8.galt_share * 100:.0f}",
        "k8_lasso_cells_in_niche": k8.lasso_cells_in_niche,
        "k8_niche_cells": k8.niche_cells,
        "k8_niche_id": k8.niche_id,
        "niche_ks": list(NICHE_KS),
        "niche_n_neighbors": NICHE_N_NEIGHBORS,
        "niche_resolutions": list(NICHE_RESOLUTIONS),
        "niche_rng": NICHE_RNG,
        "selection_count": int(selection_count),
    }


def write_numbers(adata, *, color, selection_count: int, path: Path) -> dict:
    payload = rendered_numbers(adata, color=color, selection_count=selection_count)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return payload
