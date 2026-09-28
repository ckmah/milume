"""Gene expression columns for LandmarksWidget (packed like category codes)."""

from __future__ import annotations

import base64
import math
from typing import Any


def gene_names_from_adata(
    adata: Any, genes: str | list[str] | None
) -> list[str]:
    """Resolve constructor ``genes`` to an ordered catalog of var names.

    ``None`` → all ``var_names``. A string → that gene if present in ``var``.
    A sequence → intersection preserving var order.
    """
    var_names = [str(v) for v in adata.var_names]
    if genes is None:
        return var_names
    if isinstance(genes, str):
        return [genes] if genes in set(var_names) else []
    wanted = {str(g) for g in genes}
    return [g for g in var_names if g in wanted]


def gene_catalog(names: list[str]) -> list[dict[str, Any]]:
    """Cheap gene picker metadata (vmin/vmax filled when values are packed)."""
    return [{"name": str(n), "vmin": 0.0, "vmax": 1.0} for n in names]


def _values_look_logged(vals: "np.ndarray") -> bool:
    """Heuristic: fractional values with modest max are likely already log-scaled."""
    import numpy as np

    finite = np.asarray(vals, dtype=np.float64).ravel()
    finite = finite[np.isfinite(finite)]
    if finite.size == 0:
        return False
    mx = float(np.nanmax(finite))
    # Raw UMI / counts typically exceed this; log1p(expression) rarely does.
    if mx > 30.0:
        return False
    # Integer-only matrices are almost always counts (or already rounded).
    near_int = np.isclose(finite, np.round(finite), rtol=0.0, atol=1e-5)
    frac_frac = float(np.mean(~near_int))
    if mx <= 12.0 and frac_frac > 0.05:
        return True
    if mx <= 20.0 and frac_frac > 0.15:
        return True
    return False


def expression_is_log_scaled(
    adata: Any | None = None,
    *,
    sample: Any | None = None,
) -> bool:
    """Detect whether expression is already log-scaled.

    Prefer Scanpy markers in ``adata.uns``; otherwise fall back to a value
    heuristic on ``sample`` or a thin multi-gene probe of ``adata.X``.
    """
    import numpy as np

    if adata is not None:
        uns = getattr(adata, "uns", None)
        if uns is not None:
            for key in ("log1p", "log", "logged"):
                if key in uns:
                    return True
    if sample is not None:
        return _values_look_logged(np.asarray(sample, dtype=np.float64))
    if adata is None:
        return False
    X = getattr(adata, "X", None)
    if X is None or adata.n_obs == 0 or adata.n_vars == 0:
        return False
    n_probe = min(8, int(adata.n_vars))
    votes = 0
    checked = 0
    for i in range(n_probe):
        try:
            col = _column_vector(adata, str(adata.var_names[i]))
        except Exception:
            continue
        checked += 1
        if _values_look_logged(col):
            votes += 1
    if checked == 0:
        return False
    return votes * 2 > checked


def genes_look_log_scaled(adata: Any, names: list[str]) -> bool:
    """True when every listed gene column looks already log-scaled."""
    if adata is None or not names:
        return False
    probes: list[bool] = []
    for name in names[:8]:
        try:
            probes.append(_values_look_logged(_column_vector(adata, str(name))))
        except Exception:
            continue
    return bool(probes) and all(probes)


def _var_index(adata: Any, name: str) -> int:
    """Column index for ``name`` without building an AnnData view."""
    import numpy as np

    var_names = adata.var_names
    if hasattr(var_names, "get_loc"):
        loc = var_names.get_loc(name)
        if not isinstance(loc, (int, np.integer)):
            raise KeyError(name)
        return int(loc)
    return [str(v) for v in var_names].index(str(name))


def _column_vector(adata: Any, name: str) -> "np.ndarray":
    """One expression column as float64, densifying at most that column.

    Indexes ``adata.X`` directly so AnnData views (and their ``obs`` copies)
    are not created during construct-time probes or gene packing.
    """
    import numpy as np

    idx = _var_index(adata, name)
    X = adata.X
    if hasattr(X, "getcol"):
        col = X.getcol(idx)
        if hasattr(col, "toarray"):
            col = col.toarray()
        return np.asarray(col, dtype=np.float64).ravel()
    col = X[:, idx]
    if hasattr(col, "toarray"):
        col = col.toarray()
    return np.asarray(col, dtype=np.float64).ravel()


def _normalize_column(vals: "np.ndarray") -> tuple["np.ndarray", float, float]:
    import numpy as np

    finite = vals[np.isfinite(vals)]
    if finite.size == 0:
        vmin, vmax = 0.0, 1.0
    else:
        vmin = float(np.nanmin(finite))
        vmax = float(np.nanpercentile(finite, 99))
        if not math.isfinite(vmax) or vmax <= vmin:
            vmax = float(np.nanmax(finite))
        if not math.isfinite(vmax) or vmax <= vmin:
            vmax = vmin + 1.0
    norm = ((vals - vmin) / (vmax - vmin)).astype(np.float32)
    norm = np.clip(np.nan_to_num(norm, nan=0.0), 0.0, 1.0)
    return norm, vmin, vmax


def encode_genes_from_adata(
    adata: Any,
    names: list[str],
    n_points: int,
) -> tuple[list[dict[str, Any]], str]:
    """Pack selected genes column-major float32 [0, 1] (active-genes order)."""
    import numpy as np

    if not names:
        return [], ""
    meta: list[dict[str, Any]] = []
    cols: list[Any] = []
    for name in names:
        vals = _column_vector(adata, name)
        if vals.shape[0] != n_points:
            raise ValueError(f"expr rows {vals.shape[0]} != n_points {n_points}")
        norm, vmin, vmax = _normalize_column(vals)
        meta.append({"name": str(name), "vmin": vmin, "vmax": vmax})
        cols.append(norm)
    packed = np.column_stack(cols).ravel(order="F")
    return meta, base64.b64encode(packed.tobytes()).decode("ascii")


def encode_gene_bundle(
    frame: Any,
    n_points: int,
) -> tuple[list[dict[str, Any]], str]:
    """Pack a polars/pandas-like expression frame column-major float32 [0, 1]."""
    import numpy as np

    names = [str(c) for c in frame.columns]
    if not names:
        return [], ""
    meta: list[dict[str, Any]] = []
    cols: list[Any] = []
    for name in names:
        vals = np.asarray(frame[name].to_numpy(), dtype=np.float64).ravel()
        if vals.shape[0] != n_points:
            raise ValueError(f"expr rows {vals.shape[0]} != n_points {n_points}")
        norm, vmin, vmax = _normalize_column(vals)
        meta.append({"name": name, "vmin": vmin, "vmax": vmax})
        cols.append(norm)
    packed = np.column_stack(cols).ravel(order="F")
    return meta, base64.b64encode(packed.tobytes()).decode("ascii")


# Warn when the eager gene payload actually sent exceeds this many raw bytes (~25 MiB).
GENE_MATRIX_WARN_BYTES = 25 * 1024 * 1024
# Prefer CSC when nonzero density is below this (and matrix is non-empty).
_GENE_SPARSE_DENSITY = 0.25


def _b64(arr: "np.ndarray") -> str:
    import numpy as np

    # Encode from the array buffer; ``tobytes()`` would add a full-size copy.
    return base64.b64encode(np.ascontiguousarray(arr).data).decode("ascii")


def _sparse_column_range(stored: "np.ndarray", n_implicit: int) -> tuple[float, float]:
    """``_normalize_column``'s ``(vmin, vmax)`` for a sparse column.

    ``stored`` holds the explicit entries; ``n_implicit`` more rows are zero.
    The 99th percentile is taken over the full virtual column (implicit zeros
    included) without materializing it, using numpy's default linear method.
    """
    import numpy as np

    finite = np.sort(stored[np.isfinite(stored)])
    n = int(finite.size) + int(n_implicit)
    if n == 0:
        return 0.0, 1.0
    split = int(np.searchsorted(finite, 0.0, side="left"))

    def at(k: int) -> float:
        # Sorted virtual column: finite[:split], n_implicit zeros, finite[split:].
        if k < split:
            return float(finite[k])
        if k < split + n_implicit:
            return 0.0
        return float(finite[k - n_implicit])

    vmin = at(0)
    virtual = 0.99 * (n - 1)
    lo = math.floor(virtual)
    hi = min(lo + 1, n - 1)
    gamma = virtual - lo
    a, b = at(lo), at(hi)
    diff = b - a
    # Same lerp as numpy's percentile (``_lerp``) so vmax matches the dense path.
    vmax = b - diff * (1.0 - gamma) if gamma >= 0.5 else a + diff * gamma
    if not math.isfinite(vmax) or vmax <= vmin:
        vmax = at(n - 1)
    if not math.isfinite(vmax) or vmax <= vmin:
        vmax = vmin + 1.0
    return vmin, vmax


def _scale_to_unit(vals: "np.ndarray", vmin: float, vmax: float) -> "np.ndarray":
    """Same mapping as ``_normalize_column`` for a fixed ``(vmin, vmax)``."""
    import numpy as np

    norm = ((vals - vmin) / (vmax - vmin)).astype(np.float32)
    return np.clip(np.nan_to_num(norm, nan=0.0), 0.0, 1.0)


def _normalized_sparse_columns(
    X: Any,
    names: list[str],
    adata: Any,
    n_points: int,
) -> tuple[list[dict[str, Any]], "np.ndarray", "np.ndarray", "np.ndarray"]:
    """Normalize selected columns of scipy-sparse ``X`` straight into CSC arrays.

    Never allocates the dense ``n_obs × n_genes`` matrix: work is per column over
    the stored entries. Only a column whose implicit zeros map to a nonzero value
    (negative ``vmin``) is materialized, one column at a time. Two passes (count,
    then fill) let the output arrays be allocated once at their exact size.
    """
    import numpy as np
    from scipy import sparse

    n_obs = int(X.shape[0])
    if n_obs != n_points:
        raise ValueError(f"expr rows {n_obs} != n_points {n_points}")
    idx = [_var_index(adata, name) for name in names]
    csc = X if X.format == "csc" else sparse.csc_matrix(X)
    if idx != list(range(csc.shape[1])):
        csc = csc[:, idx]
    if not csc.has_canonical_format:
        # Never canonicalize the caller's matrix in place.
        csc = csc.copy() if csc is X else csc
        csc.sum_duplicates()

    def column(j: int) -> tuple["np.ndarray", "np.ndarray", float, float]:
        a, b = int(csc.indptr[j]), int(csc.indptr[j + 1])
        rows = csc.indices[a:b]
        stored = np.asarray(csc.data[a:b], dtype=np.float64)
        n_implicit = n_obs - (b - a)
        vmin, vmax = _sparse_column_range(stored, n_implicit)
        norm = _scale_to_unit(stored, vmin, vmax)
        zero_as = float(_scale_to_unit(np.zeros(1), vmin, vmax)[0])
        if n_implicit and zero_as != 0.0:
            full = np.full(n_obs, zero_as, dtype=np.float32)
            full[rows] = norm
            keep_rows = np.flatnonzero(full)
            return keep_rows, full[keep_rows], vmin, vmax
        keep = norm != 0.0
        return rows[keep], norm[keep], vmin, vmax

    meta: list[dict[str, Any]] = []
    indptr = np.zeros(len(names) + 1, dtype=np.int64)
    for j, name in enumerate(names):
        keep_rows, _, vmin, vmax = column(j)
        meta.append({"name": str(name), "vmin": vmin, "vmax": vmax})
        indptr[j + 1] = indptr[j] + keep_rows.size

    indices = np.empty(int(indptr[-1]), dtype=np.int32)
    data = np.empty(int(indptr[-1]), dtype=np.float32)
    for j in range(len(names)):
        keep_rows, keep_vals, _, _ = column(j)
        indices[indptr[j] : indptr[j + 1]] = keep_rows
        data[indptr[j] : indptr[j + 1]] = keep_vals
    return meta, indptr, indices, data


def _warn_if_large(
    sent_bytes: int, fmt: str, n_obs: int, n_vars: int, nnz: int
) -> None:
    import warnings

    if sent_bytes <= GENE_MATRIX_WARN_BYTES:
        return
    detail = f"{fmt}, {n_obs} cells × {n_vars} genes"
    if fmt == "csc":
        detail += f", {nnz} nonzeros"
    warnings.warn(
        f"LandmarksWidget eager gene payload is {sent_bytes / (1024 ** 2):.1f} MiB "
        f"({detail}). Pass genes= to restrict the catalog; sending anyway.",
        UserWarning,
        stacklevel=4,
    )


def _csc_payload(
    indptr: "np.ndarray", indices: "np.ndarray", data: "np.ndarray"
) -> dict[str, str]:
    import numpy as np

    return {
        "gene_format": "csc",
        "gene_values": "",
        "gene_csc_indptr": _b64(np.asarray(indptr, dtype=np.int32)),
        "gene_csc_indices": _b64(np.asarray(indices, dtype=np.int32)),
        "gene_csc_data": _b64(np.asarray(data, dtype=np.float32)),
    }


def _dense_payload(mat: "np.ndarray") -> dict[str, str]:
    return {
        "gene_format": "dense",
        "gene_values": _b64(mat.ravel(order="F")),
        "gene_csc_indptr": "",
        "gene_csc_indices": "",
        "gene_csc_data": "",
    }


def pack_eager_gene_matrix(
    adata: Any,
    names: list[str],
    n_points: int,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Eager-pack all catalog genes for the browser (view-only).

    Returns ``(meta, payload)`` where ``payload`` is either::

        {"gene_format": "dense", "gene_values": <b64 float32 col-major>}

    or::

        {
          "gene_format": "csc",
          "gene_csc_indptr": <b64 int32>,
          "gene_csc_indices": <b64 int32>,
          "gene_csc_data": <b64 float32>,
        }

    A scipy-sparse ``adata.X`` is normalized straight into CSC arrays (density
    from the normalized nonzero count) with no dense intermediate; the dense
    matrix is built only when it is itself the payload. Dense ``X`` packs per
    column as before.

    Emits a :class:`UserWarning` when the raw bytes actually sent exceed
    :data:`GENE_MATRIX_WARN_BYTES`, but still packs the matrix.
    """
    import numpy as np
    from scipy import sparse

    if not names:
        return [], {"gene_format": "dense", "gene_values": ""}

    n_vars = len(names)
    X = getattr(adata, "X", None)
    if sparse.issparse(X):
        meta, indptr, indices, data = _normalized_sparse_columns(
            X, names, adata, n_points
        )
        n_obs = int(n_points)
        nnz = int(data.size)
        size = n_obs * n_vars
        density = nnz / float(size) if size else 1.0
        if density < _GENE_SPARSE_DENSITY and nnz > 0:
            # int32 indptr + int32 indices + float32 data on the wire.
            _warn_if_large(4 * (n_vars + 1) + 8 * nnz, "csc", n_obs, n_vars, nnz)
            return meta, _csc_payload(indptr, indices, data)
        mat = sparse.csc_matrix((data, indices, indptr), shape=(n_obs, n_vars)).toarray(
            order="F"
        )
        _warn_if_large(int(mat.nbytes), "dense", n_obs, n_vars, nnz)
        return meta, _dense_payload(mat)

    meta: list[dict[str, Any]] = []
    cols: list[np.ndarray] = []
    for name in names:
        vals = _column_vector(adata, name)
        if vals.shape[0] != n_points:
            raise ValueError(f"expr rows {vals.shape[0]} != n_points {n_points}")
        norm, vmin, vmax = _normalize_column(vals)
        meta.append({"name": str(name), "vmin": vmin, "vmax": vmax})
        cols.append(norm)

    mat = np.column_stack(cols).astype(np.float32, copy=False)
    n_obs = int(mat.shape[0])
    nnz = int(np.count_nonzero(mat))
    density = nnz / float(mat.size) if mat.size else 1.0
    if density < _GENE_SPARSE_DENSITY and nnz > 0:
        csc = sparse.csc_matrix(mat)
        _warn_if_large(4 * (n_vars + 1) + 8 * nnz, "csc", n_obs, n_vars, nnz)
        return meta, _csc_payload(csc.indptr, csc.indices, csc.data)

    _warn_if_large(int(mat.nbytes), "dense", n_obs, n_vars, nnz)
    return meta, _dense_payload(mat)
