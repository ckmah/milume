"""Categorical columns for LandmarksWidget (polars / Arrow-backed)."""

from __future__ import annotations

import base64
from typing import Any


def _matplotlib_tab(name: str) -> list[str]:
    from matplotlib.colors import to_hex
    import matplotlib.pyplot as plt

    cmap = plt.get_cmap(name)
    return [to_hex(cmap(i)).lower() for i in range(cmap.N)]


_TAB10 = _matplotlib_tab("tab10")
_TAB20 = _matplotlib_tab("tab20")
_TAB20B = _matplotlib_tab("tab20b")
_TAB20C = _matplotlib_tab("tab20c")

# Largest default pool (tab20 + tab20b + tab20c). Prefer
# ``default_categorical_palette(n)`` so the pool matches category count.
DEFAULT_CATEGORICAL_PALETTE = _TAB20 + _TAB20B + _TAB20C

_MAX_LEVELS = 128
MISSING_LABEL = "NA"  # shown for missing values in a category column


def default_categorical_palette(n: int) -> list[str]:
    """Pick the smallest matplotlib tab* pool that fits ``n`` categories.

    - ``n ≤ 10`` → tab10
    - ``n ≤ 20`` → tab20
    - ``n ≤ 40`` → tab20 + tab20b
    - else → tab20 + tab20b + tab20c (wraps if ``n > 60``)
    """
    n = max(int(n), 0)
    if n <= 10:
        pool = _TAB10
    elif n <= 20:
        pool = _TAB20
    elif n <= 40:
        pool = _TAB20 + _TAB20B
    else:
        pool = DEFAULT_CATEGORICAL_PALETTE
    if n == 0:
        return list(pool)
    return [pool[i % len(pool)] for i in range(n)]


def _text_series(name: str, series: Any) -> Any:
    """A pandas column as a polars string Series; missing values become nulls."""
    import numpy as np
    import polars as pl

    missing = series.isna().to_numpy()
    text = np.where(missing, "", series.astype(object).to_numpy()).astype(str)
    out = pl.Series(name, text, dtype=pl.Utf8)
    return out.set(pl.Series(missing), None) if missing.any() else out


def as_polars(frame: Any) -> Any:
    """Coerce pandas / polars / mapping to a polars DataFrame."""
    import polars as pl

    if isinstance(frame, pl.DataFrame):
        return frame
    if type(frame).__module__.startswith("pandas"):
        import pandas as pd

        if isinstance(frame, pd.DataFrame):
            # Categorical / extension columns need pyarrow for ``pl.from_pandas``.
            # Convert via numpy so AnnData ``obs`` works without that extra.
            cols: dict[str, Any] = {}
            for name in frame.columns:
                series = frame[name]
                if isinstance(series.dtype, pd.CategoricalDtype):
                    cols[str(name)] = _text_series(str(name), series)
                else:
                    values = series.to_numpy()
                    if values.dtype == object:
                        cols[str(name)] = _text_series(str(name), series)
                    else:
                        cols[str(name)] = values
            return pl.DataFrame(cols)
        return pl.from_pandas(frame)
    if hasattr(frame, "__dataframe__"):
        return pl.from_pandas(frame)
    if isinstance(frame, dict):
        return pl.DataFrame(frame)
    raise TypeError(f"unsupported frame type: {type(frame)!r}")


def detect_category_columns(df: Any, *, skip: set[str] | None = None) -> list[str]:
    """Return Utf8 / Categorical / Enum / Boolean column names (low cardinality)."""
    import polars as pl

    skip = skip or set()
    out: list[str] = []
    for name, dtype in df.schema.items():
        if name in skip:
            continue
        ok = dtype in (pl.Utf8, pl.String, pl.Categorical, pl.Boolean) or isinstance(
            dtype, pl.Enum
        )
        if not ok:
            continue
        nuniq = int(df[name].n_unique())
        if 1 < nuniq <= _MAX_LEVELS:
            out.append(name)
    return out


def encode_category_bundle(
    df: Any,
    columns: list[str],
    *,
    color_maps: dict[str, dict[str, str]] | None = None,
) -> tuple[list[dict[str, Any]], str, dict[str, Any]]:
    """Return (meta, codes_b64, label_arrays).

    Codes are column-major Int32 (Arrow-backed polars → contiguous buffer),
    base64-encoded for the widget traitlet. ``meta`` items are
    ``{name, labels, palette}``.
    """
    import numpy as np
    import polars as pl

    color_maps = color_maps or {}
    meta: list[dict[str, Any]] = []
    code_arrays: list[Any] = []
    label_arrays: dict[str, Any] = {}

    for name in columns:
        series = df[name].cast(pl.Utf8).fill_null(MISSING_LABEL)
        labels = [str(v) for v in series.unique(maintain_order=True).to_list()]
        cmap = color_maps.get(name) or {}
        if cmap:
            present = set(labels)
            ordered = [str(k) for k in cmap.keys() if str(k) in present]
            ordered.extend(lab for lab in labels if lab not in ordered)
            labels = ordered
            fallback = default_categorical_palette(len(labels))
            palette = [
                cmap.get(lab, fallback[i]) for i, lab in enumerate(labels)
            ]
        else:
            palette = default_categorical_palette(len(labels))
        codes = (
            series.replace_strict(
                old=labels,
                new=list(range(len(labels))),
                default=0,
                return_dtype=pl.Int32,
            )
            .to_numpy()
            .astype(np.int32, copy=False)
        )
        code_arrays.append(codes)
        label_arrays[name] = np.asarray(series.to_list(), dtype=str)
        meta.append({"name": name, "labels": labels, "palette": palette})

    if not code_arrays:
        return meta, "", label_arrays
    mat = np.column_stack(code_arrays).astype(np.int32, copy=False)
    # column-major for JS: codes[col * n + row]
    codes_b64 = base64.b64encode(np.asfortranarray(mat).tobytes(order="F")).decode(
        "ascii"
    )
    return meta, codes_b64, label_arrays
