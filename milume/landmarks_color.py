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
    "color_diverging": False,
    "gene_scale_mode": "independent",
    "gene_log1p": False,
    "raster_embedding_dims": [],
}

_SEQUENTIAL_LOW = "#f3e6d4"
_SEQUENTIAL_HIGH = "#ff0099"
_DIVERGING_LOW = "#2166ac"
_DIVERGING_MID = "#f7f7f7"
_DIVERGING_HIGH = "#b2182b"


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


def _sample_colormap(n: int, stops: list[tuple[float, str]]) -> list[str]:
    """Piecewise-linear RGB stops → hex (matplotlib-style rounding)."""
    if n <= 0:
        return []
    if len(stops) == 1:
        return [stops[0][1]] * n

    def hex_rgb(h: str) -> np.ndarray:
        h = str(h).lstrip("#")
        return np.array([int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float64)

    pts = sorted(stops, key=lambda x: x[0])
    ts = np.array([t for t, _ in pts], dtype=np.float64)
    rgbs = np.stack([hex_rgb(h) for _, h in pts])
    if n == 1:
        row = rgbs[-1]
    else:
        t_query = np.linspace(0.0, 1.0, n)
        row = np.empty((n, 3), dtype=np.float64)
        for i, t in enumerate(t_query):
            j = int(np.searchsorted(ts, t, side="right") - 1)
            j = max(0, min(j, len(ts) - 2))
            t0, t1 = ts[j], ts[j + 1]
            w = 0.0 if t1 <= t0 else (t - t0) / (t1 - t0)
            row[i] = (1.0 - w) * rgbs[j] + w * rgbs[j + 1]
    return [
        "#" + "".join(format(round(float(c) * 255), "02x") for c in rgb) for rgb in row
    ]


def sequential_palette(
    n: int = 256,
    low: str = _SEQUENTIAL_LOW,
    high: str = _SEQUENTIAL_HIGH,
) -> list[str]:
    """Lazy import avoids circular import with ``milume.landmarks``."""
    from milume.landmarks import _sequential_palette

    return _sequential_palette(n, low=low, high=high)


def diverging_palette(
    n: int = 256,
    low: str = _DIVERGING_LOW,
    mid: str = _DIVERGING_MID,
    high: str = _DIVERGING_HIGH,
) -> list[str]:
    return _sample_colormap(n, [(0.0, low), (0.5, mid), (1.0, high)])


def numeric_spans_zero(finite: np.ndarray) -> bool:
    if finite.size == 0:
        return False
    return float(finite.min()) < 0.0 < float(finite.max())


def symmetric_diverging_limits(finite: np.ndarray) -> tuple[float, float]:
    lim = float(np.max(np.abs(finite)))
    if not np.isfinite(lim) or lim <= 0.0:
        lim = 1.0
    return -lim, lim


def encode_numeric_obs_colors(
    vals: np.ndarray,
    *,
    diverging: bool | None = None,
) -> tuple[list[str], np.ndarray, float, float, bool]:
    """Palette, normalized valueA in [0, 1], vmin, vmax, and diverging flag."""
    raw = np.asarray(vals, dtype=np.float64)
    finite = raw[np.isfinite(raw)]
    if finite.size == 0:
        pal = sequential_palette(256)
        return pal, np.zeros(raw.shape[0], dtype=np.float32), 0.0, 1.0, False

    use_diverging = numeric_spans_zero(finite) if diverging is None else bool(diverging)
    if use_diverging:
        vmin, vmax = symmetric_diverging_limits(finite)
        pal = diverging_palette(256)
    else:
        from milume.landmarks import _sequential_palette

        vmin = float(np.nanmin(finite))
        vmax = float(np.nanpercentile(finite, 99))
        if not np.isfinite(vmax) or vmax <= vmin:
            vmax = float(np.nanmax(finite))
        if not np.isfinite(vmax) or vmax <= vmin:
            vmax = vmin + 1.0
        pal = _sequential_palette(256)

    span = vmax - vmin
    norm = ((raw - vmin) / span).astype(np.float32)
    norm = np.clip(np.nan_to_num(norm, nan=0.0), 0.0, 1.0)
    return pal, norm, float(vmin), float(vmax), use_diverging


def obs_numeric_meta(obs: Any) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for name in obs.columns:
        series = obs[name]
        if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
            vals = np.asarray(series, dtype=np.float64)
            finite = vals[np.isfinite(vals)]
            if finite.size:
                signed = numeric_spans_zero(finite)
                if signed:
                    lo, hi = symmetric_diverging_limits(finite)
                    out[str(name)] = {
                        "kind": "numeric",
                        "signed": True,
                        "range": [lo, hi],
                    }
                else:
                    out[str(name)] = {
                        "kind": "numeric",
                        "signed": False,
                        "range": [float(finite.min()), float(finite.max())],
                    }
            else:
                out[str(name)] = {"kind": "numeric", "signed": False, "range": [0.0, 1.0]}
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
