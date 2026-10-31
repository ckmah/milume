"""Colour catalog helpers and the public ``color`` trait for LandmarksWidget."""

from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd
import traitlets

from .categories import detect_category_columns

__all__ = [
    "ColorSpec",
    "DEFAULT_LOOK",
    "DEFAULT_COLOR_STATE",
    "build_color_options",
    "obs_numeric_meta",
    "normalize_color_value",
    "color_key_from_value",
    "warn_deprecated_trait",
]


class ColorSpec(traitlets.Union):
    """Public colour state: obs column, gene name, gene list (blend), or ``obsm`` key."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            [traitlets.Unicode(), traitlets.List(traitlets.Unicode())],
            **kwargs,
        )


DEFAULT_COLOR_STATE: dict[str, Any] = {
    "color_mode": "categorical",
    "legend_title": "",
    "legend_labels": [],
    "raster_basis": "composition",
    "raster_embedding_key": "",
}

DEFAULT_LOOK: dict[str, Any] = {
    "point_palette": [],
    "color_vmin": 0.0,
    "color_vmax": 1.0,
    "gene_scale_mode": "independent",
    "gene_log1p": False,
    "raster_embedding_dims": [],
}


def normalize_color_value(value: Any) -> str | list[str]:
    if value is None or value == "":
        return ""
    if isinstance(value, (list, tuple)):
        out = [str(x) for x in value if str(x)]
        return out if out else ""
    return str(value)


def color_key_from_value(value: Any) -> str:
    """Single string key for logs/tests; gene lists join with comma."""
    norm = normalize_color_value(value)
    if isinstance(norm, list):
        return ",".join(norm)
    return norm


def obs_numeric_meta(obs: Any) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for name in obs.columns:
        series = obs[name]
        if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
            vals = np.asarray(series, dtype=np.float64)
            finite = vals[np.isfinite(vals)]
            if finite.size:
                out[str(name)] = {
                    "kind": "numeric",
                    "range": [float(finite.min()), float(finite.max())],
                }
            else:
                out[str(name)] = {"kind": "numeric", "range": [0.0, 1.0]}
    return out


def build_color_options(
    *,
    category_columns: list[dict[str, Any]],
    gene_names: list[dict[str, Any]],
    embedding_keys: list[str],
    adata: Any,
) -> dict[str, Any]:
    obs: dict[str, dict[str, Any]] = {}
    for meta in category_columns:
        name = str(meta.get("name") or "")
        if not name:
            continue
        labels = meta.get("labels") or []
        obs[name] = {"kind": "category", "n_categories": len(labels)}
    skip = set(obs.keys())
    df = adata.obs
    for name in detect_category_columns(df, skip=skip):
        if name in obs:
            continue
        series = df[name]
        n_levels = int(series.nunique(dropna=False))
        if n_levels <= 128:
            obs[name] = {"kind": "category", "n_categories": n_levels}
    for name, meta in obs_numeric_meta(df).items():
        if name not in obs:
            obs[name] = meta
    genes = [
        {
            "name": str(g.get("name") or ""),
            **({k: g[k] for k in ("vmin", "vmax") if k in g}),
        }
        for g in gene_names
        if g.get("name")
    ]
    embeddings: dict[str, int] = {}
    obsm = getattr(adata, "obsm", None)
    # ``embedding_keys`` already drops coordinate matrices (``spatial`` and kin).
    keys = list(dict.fromkeys(embedding_keys))
    for key in keys:
        if obsm is None or key not in obsm:
            continue
        mat = np.asarray(obsm[key])
        if mat.ndim == 1:
            mat = mat.reshape(-1, 1)
        if mat.shape[1] >= 2:
            embeddings[str(key)] = int(mat.shape[1])
    return {"obs": obs, "genes": genes, "embeddings": embeddings}


def warn_deprecated_trait(name: str) -> None:
    warnings.warn(
        f"LandmarksWidget.{name} is deprecated and will be removed in 3.0; assign "
        f"``color`` instead (scanpy-style obs column, gene, gene list, or obsm key).",
        DeprecationWarning,
        stacklevel=3,
    )
