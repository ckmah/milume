"""Categorical columns for LandmarksWidget (pandas categorical codes)."""

from __future__ import annotations

import base64
from typing import Any


# matplotlib's tab10 / tab20 / tab20b / tab20c qualitative palettes as hex,
# hardcoded so milume does not depend on matplotlib (tests/test_palettes.py
# checks them against matplotlib when it is installed).
_TAB10 = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
]
_TAB20 = [
    "#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c",
    "#98df8a", "#d62728", "#ff9896", "#9467bd", "#c5b0d5",
    "#8c564b", "#c49c94", "#e377c2", "#f7b6d2", "#7f7f7f",
    "#c7c7c7", "#bcbd22", "#dbdb8d", "#17becf", "#9edae5",
]
_TAB20B = [
    "#393b79", "#5254a3", "#6b6ecf", "#9c9ede", "#637939",
    "#8ca252", "#b5cf6b", "#cedb9c", "#8c6d31", "#bd9e39",
    "#e7ba52", "#e7cb94", "#843c39", "#ad494a", "#d6616b",
    "#e7969c", "#7b4173", "#a55194", "#ce6dbd", "#de9ed6",
]
_TAB20C = [
    "#3182bd", "#6baed6", "#9ecae1", "#c6dbef", "#e6550d",
    "#fd8d3c", "#fdae6b", "#fdd0a2", "#31a354", "#74c476",
    "#a1d99b", "#c7e9c0", "#756bb1", "#9e9ac8", "#bcbddc",
    "#dadaeb", "#636363", "#969696", "#bdbdbd", "#d9d9d9",
]

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


def as_frame(frame: Any) -> Any:
    """Coerce pandas / polars / pyarrow / mapping to a pandas DataFrame.

    pandas frames are returned as-is (no copy), so ``adata.obs`` is referenced.
    """
    import pandas as pd

    if isinstance(frame, pd.DataFrame):
        return frame
    if isinstance(frame, pd.Series):
        return frame.to_frame()
    if isinstance(frame, dict):
        return pd.DataFrame(frame)
    to_pandas = getattr(frame, "to_pandas", None)
    if callable(to_pandas):  # polars / pyarrow tables, without importing them
        return to_pandas()
    if hasattr(frame, "__dataframe__"):
        return pd.api.interchange.from_dataframe(frame)
    raise TypeError(f"unsupported frame type: {type(frame)!r}")


def _category_text(series: Any, *, any_dtype: bool = False) -> tuple[Any, Any] | None:
    """``(text, missing)`` for a category-like column, else ``None``.

    Category-like: pandas categorical, object / string (``to_numpy()`` is
    object), or numpy bool. ``text`` is a numpy ``str`` array (``str(value)``;
    bools are ``"true"`` / ``"false"``) and ``missing`` marks NA / None / NaN.
    With ``any_dtype`` other columns are stringified the same way instead of
    returning ``None``.
    """
    import numpy as np
    import pandas as pd

    if isinstance(series.dtype, pd.CategoricalDtype):
        codes = series.cat.codes.to_numpy()
        missing = codes < 0
        cats = np.asarray(series.cat.categories, dtype=object).astype(str)
        if cats.size == 0:
            return np.full(codes.shape[0], "", dtype=str), missing
        return cats[np.where(missing, 0, codes)], missing
    values = series.to_numpy()
    if values.dtype == bool:
        return np.where(values, "true", "false"), np.zeros(values.shape[0], dtype=bool)
    if values.dtype != object and not any_dtype:
        return None
    missing = np.asarray(series.isna().to_numpy(), dtype=bool)
    if values.dtype != object:
        values = values.astype(object)
    text = values.astype(str)
    if missing.any():
        text = np.where(missing, "", text)
    return text, missing


def _n_text_levels(series: Any, cap: int) -> int | None:
    """Distinct ``_category_text`` values (missing counts as one), or ``None``.

    Hashes the raw values and stringifies only the distinct ones, stopping once
    more than ``cap`` texts are seen; ``str`` can only merge raw values, so the
    count is exact up to ``cap``.
    """
    import numpy as np
    import pandas as pd

    if isinstance(series.dtype, pd.CategoricalDtype):
        codes = series.cat.codes.to_numpy()
        used = np.flatnonzero(np.bincount(codes[codes >= 0]))
        cats = np.asarray(series.cat.categories, dtype=object)
        distinct = (str(c) for c in cats[used])
        has_missing = bool((codes < 0).any())
    else:
        values = series.to_numpy()
        if values.dtype == bool:
            return int(np.unique(values).size)
        if values.dtype != object:
            return None
        missing = np.asarray(series.isna().to_numpy(), dtype=bool)
        has_missing = bool(missing.any())
        distinct = (str(v) for v in pd.unique(values[~missing] if has_missing else values))
    seen: set[str] = set()
    for text in distinct:
        seen.add(text)
        if len(seen) > cap:
            break
    return len(seen) + int(has_missing)


def detect_category_columns(df: Any, *, skip: set[str] | None = None) -> list[str]:
    """Return text / categorical / boolean column names with 2..128 levels.

    A missing value counts as one level.
    """
    skip = skip or set()
    out: list[str] = []
    for name in df.columns:
        if name in skip:
            continue
        nuniq = _n_text_levels(df[name], _MAX_LEVELS)
        if nuniq is not None and 1 < nuniq <= _MAX_LEVELS:
            out.append(str(name))
    return out


def encode_category_bundle(
    df: Any,
    columns: list[str],
    *,
    color_maps: dict[str, dict[str, str]] | None = None,
) -> tuple[list[dict[str, Any]], str, dict[str, Any]]:
    """Return (meta, codes_b64, label_arrays).

    Codes are column-major Int32, base64-encoded for the widget traitlet.
    ``meta`` items are ``{name, labels, palette}``; labels follow first
    appearance (missing values read ``MISSING_LABEL``), or the ``color_maps``
    key order first when one is given for the column.
    """
    import numpy as np
    import pandas as pd

    color_maps = color_maps or {}
    meta: list[dict[str, Any]] = []
    code_arrays: list[Any] = []
    label_arrays: dict[str, Any] = {}

    for name in columns:
        text, missing = _category_text(df[name], any_dtype=True)
        filled = np.where(missing, MISSING_LABEL, text) if missing.any() else text
        first_codes, uniques = pd.factorize(filled, sort=False)
        labels = [str(v) for v in uniques]
        cmap = color_maps.get(name) or {}
        if cmap:
            present = set(labels)
            ordered = [str(k) for k in cmap.keys() if str(k) in present]
            ordered.extend(lab for lab in labels if lab not in ordered)
            remap = np.empty(len(labels), dtype=np.int32)
            position = {lab: i for i, lab in enumerate(ordered)}
            for i, lab in enumerate(labels):
                remap[i] = position[lab]
            codes = remap[first_codes]
            labels = ordered
            fallback = default_categorical_palette(len(labels))
            palette = [
                cmap.get(lab, fallback[i]) for i, lab in enumerate(labels)
            ]
        else:
            codes = first_codes.astype(np.int32, copy=False)
            palette = default_categorical_palette(len(labels))
        code_arrays.append(codes)
        label_arrays[name] = filled
        meta.append({"name": name, "labels": labels, "palette": palette})

    if not code_arrays:
        return meta, "", label_arrays
    mat = np.column_stack(code_arrays).astype(np.int32, copy=False)
    # column-major for JS: codes[col * n + row]
    codes_b64 = base64.b64encode(np.asfortranarray(mat).tobytes(order="F")).decode(
        "ascii"
    )
    return meta, codes_b64, label_arrays
