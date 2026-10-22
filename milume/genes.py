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
    from scipy import sparse

    if sparse.issparse(X) and hasattr(X, "data"):
        # Column probes scan every stored entry of a CSR matrix; the leading stored
        # values (zeros excluded) answer "counts or logged?" without that scan.
        return _values_look_logged(np.asarray(X.data[:65536]))
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


# Hard cap on the eager ``genes=`` pack (raw int32 + float32 CSC bytes). Above it the
# allowlist is served per gene on demand instead, so nothing ships a multi-GB payload.
GENE_EAGER_MAX_BYTES = 64 * 1024 * 1024
# Most genes one ``_gene_get`` request may name (bounds one reply to ~16 sparse columns).
GENE_FETCH_MAX_NAMES = 16


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


GeneSlice = tuple[dict[str, Any], "np.ndarray", "np.ndarray"]

# Rows ``_csr_columns`` searches per pass: ``_CSR_SEARCH_ROWS // genes**2``, at least
# ``_CSR_SEARCH_MIN_ROWS``. Keeps scratch under ~1 MiB; at 170k x 18k this measured
# 45 ms for 1 gene and 350 ms for 16 (vs 480 ms with 4096-row passes).
_CSR_SEARCH_ROWS = 1 << 16
_CSR_SEARCH_MIN_ROWS = 1 << 10


def _csr_columns(X: Any, idx: list[int]) -> Any:
    """CSC of ``X[:, idx]`` for a canonical CSR ``X`` without scanning every entry.

    ``X[:, idx]`` on CSR reads all ``nnz`` stored indices per request (about 0.6 s at
    170k x 18k with 307M stored values). Each row's indices are sorted, so a
    lower-bound binary search per row finds column ``j`` in ``log2(max row length)``
    steps, for every (row, gene) pair at once. Cost scales with
    ``n_obs * len(idx) * log2(row length)``; no index is built or kept.
    """
    import numpy as np
    from scipy import sparse

    n_obs, k = int(X.shape[0]), len(idx)
    if X.nnz == 0:
        return sparse.csc_matrix((n_obs, k), dtype=X.dtype)
    indices = X.indices
    max_len = int(np.diff(X.indptr).max())
    # Positions reach ``nnz + 2 * max_len`` mid-search; int32 halves the working set.
    pos_dtype = np.int32 if int(X.nnz) + 2 * max_len < 2**31 else np.int64
    indptr = np.asarray(X.indptr, dtype=pos_dtype)
    targets = np.asarray(idx, dtype=indices.dtype)
    # Rows per pass: big for one gene (fewer numpy calls), small for many genes so
    # every gene probes the same few MiB of rows while they are still in cache.
    chunk = max(_CSR_SEARCH_MIN_ROWS, _CSR_SEARCH_ROWS // (k * k))
    rows_parts: list[list[Any]] = [[] for _ in idx]
    data_parts: list[list[Any]] = [[] for _ in idx]
    for r0 in range(0, n_obs, chunk):
        r1 = min(n_obs, r0 + chunk)
        m = r1 - r0
        # Lane ``g * m + r`` searches row ``r0 + r`` for gene ``idx[g]``.
        end = np.tile(indptr[r0 + 1 : r1 + 1], k)
        target = np.repeat(targets, m)
        # base: last position in the row holding an index < target (row start - 1 if none).
        base = np.tile(indptr[r0:r1], k) - 1
        probe = np.empty_like(base)
        hit = np.empty(base.shape, dtype=bool)
        below = np.empty_like(hit)
        step = 1 << max_len.bit_length()
        while step:
            np.add(base, step, out=probe)
            np.less(probe, end, out=hit)
            np.less(indices.take(probe, mode="clip"), target, out=below)
            hit &= below
            np.add(base, step, out=base, where=hit)
            step >>= 1
        base += 1
        np.less(base, end, out=hit)
        np.equal(indices.take(base, mode="clip"), target, out=below)
        hit &= below
        lanes = np.flatnonzero(hit)
        vals = np.asarray(X.data.take(base[lanes]))
        rows = (lanes % m + r0).astype(np.int32)
        cut = np.searchsorted(lanes // m, np.arange(k + 1))
        for g in range(k):
            rows_parts[g].append(rows[cut[g] : cut[g + 1]])
            data_parts[g].append(vals[cut[g] : cut[g + 1]])
    colptr = np.zeros(k + 1, dtype=np.int64)
    np.cumsum([sum(r.size for r in parts) for parts in rows_parts], out=colptr[1:])
    data = np.concatenate([d for parts in data_parts for d in parts])
    rows = np.concatenate([r for parts in rows_parts for r in parts])
    return sparse.csc_matrix((data, rows, colptr), shape=(n_obs, k))


def _sparse_slice(
    name: str, rows: "np.ndarray", stored: "np.ndarray", n_obs: int
) -> GeneSlice:
    """Normalize one sparse column to [0, 1] and keep only its nonzero rows."""
    import numpy as np

    stored = np.asarray(stored, dtype=np.float64)
    n_implicit = n_obs - int(stored.size)
    vmin, vmax = _sparse_column_range(stored, n_implicit)
    norm = _scale_to_unit(stored, vmin, vmax)
    zero_as = float(_scale_to_unit(np.zeros(1), vmin, vmax)[0])
    meta = {"name": str(name), "vmin": vmin, "vmax": vmax}
    if n_implicit and zero_as != 0.0:
        # Negative vmin: implicit zeros map above 0, so this one column goes dense.
        full = np.full(n_obs, zero_as, dtype=np.float32)
        full[rows] = norm
        keep = np.flatnonzero(full).astype(np.int32)
        return meta, keep, full[keep]
    keep = norm != 0.0
    return meta, np.asarray(rows[keep], dtype=np.int32), norm[keep]


def gene_slices(adata: Any, names: list[str]) -> list[GeneSlice]:
    """Normalized ``(meta, rows, values)`` for each of ``names``, in order.

    ``rows`` are int32 indices of nonzero cells; ``values`` are float32 in
    ``[0, 1]`` scaled per gene by its ``(vmin, vmax)`` (min..p99). Sparse ``X``
    is sliced to just these columns, so memory scales with their nonzeros and
    never with the whole matrix. Dense ``X`` densifies one column at a time.
    """
    import numpy as np
    from scipy import sparse

    if not names:
        return []
    X = adata.X
    n_obs = int(X.shape[0])
    if sparse.issparse(X):
        idx = [_var_index(adata, name) for name in names]
        if X.format == "csr" and X.has_canonical_format:
            # Checked once per matrix (scipy caches it); duplicates or unsorted rows scan.
            sub = _csr_columns(X, idx)
        else:
            sub = X[:, idx] if X.format in ("csr", "csc") else sparse.csc_matrix(X)[:, idx]
            sub = sparse.csc_matrix(sub)
        if not sub.has_canonical_format:
            sub = sub.copy()
            sub.sum_duplicates()
        out = []
        for j, name in enumerate(names):
            a, b = int(sub.indptr[j]), int(sub.indptr[j + 1])
            out.append(_sparse_slice(name, sub.indices[a:b], sub.data[a:b], n_obs))
        return out
    out = []
    for name in names:
        norm, vmin, vmax = _normalize_column(_column_vector(adata, name))
        rows = np.flatnonzero(norm).astype(np.int32)
        out.append(({"name": str(name), "vmin": vmin, "vmax": vmax}, rows, norm[rows]))
    return out


def eager_pack_bytes(adata: Any, names: list[str]) -> int:
    """Upper-bound raw bytes of the eager CSC pack for ``names`` (stored entries).

    Counts stored entries per column without copying ``X``; dense ``X`` counts
    every cell. Used to decide eager vs on-demand before any packing happens.
    """
    import numpy as np
    from scipy import sparse

    if not names:
        return 0
    X = adata.X
    n_obs = int(X.shape[0])
    if sparse.issparse(X) and X.format in ("csr", "csc"):
        idx = np.asarray([_var_index(adata, name) for name in names], dtype=np.int64)
        if X.format == "csc":
            per_col = np.diff(np.asarray(X.indptr, dtype=np.int64))
        else:
            per_col = np.bincount(X.indices, minlength=int(X.shape[1]))
        stored = int(per_col[idx].sum())
    else:
        stored = n_obs * len(names)
    return 4 * (len(names) + 1) + 8 * stored


def _empty_payload() -> dict[str, str]:
    return {"gene_csc_indptr": "", "gene_csc_indices": "", "gene_csc_data": ""}


def pack_eager_gene_matrix(
    adata: Any,
    names: list[str],
    n_points: int,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Eager-pack ``names`` as one CSC for the browser (view-only).

    Returns ``(meta, payload)``; ``payload`` holds base64 ``gene_csc_indptr``
    (int32), ``gene_csc_indices`` (int32) and ``gene_csc_data`` (float32), with
    column ``j`` the normalized slice of ``names[j]`` (see :func:`gene_slices`).
    Callers gate the size with :func:`eager_pack_bytes` first.
    """
    import numpy as np

    if not names:
        return [], _empty_payload()
    n_obs = int(adata.X.shape[0])
    if n_obs != int(n_points):
        raise ValueError(f"expr rows {n_obs} != n_points {n_points}")
    slices = gene_slices(adata, names)
    indptr = np.zeros(len(slices) + 1, dtype=np.int64)
    np.cumsum([rows.size for _, rows, _ in slices], out=indptr[1:])
    payload = {
        "gene_csc_indptr": _b64(indptr.astype(np.int32)),
        "gene_csc_indices": _b64(
            np.concatenate([rows for _, rows, _ in slices]).astype(np.int32, copy=False)
        ),
        "gene_csc_data": _b64(
            np.concatenate([vals for _, _, vals in slices]).astype(np.float32, copy=False)
        ),
    }
    return [meta for meta, _, _ in slices], payload


def gene_catalog(
    adata: Any, genes: str | list[str] | None, n_points: int
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Gene catalog and optional eager pack for the widget.

    ``genes=None`` sends names only; the browser fetches each gene when it is
    first coloured. A ``genes=`` allowlist is packed eagerly when it fits in
    :data:`GENE_EAGER_MAX_BYTES`; above that it falls back to the same
    on-demand path with a :class:`UserWarning`, so the widget still opens.
    """
    import warnings

    names = gene_names_from_adata(adata, genes)
    if genes is None or not names:
        return [{"name": n} for n in names], _empty_payload()
    size = eager_pack_bytes(adata, names)
    if size > GENE_EAGER_MAX_BYTES:
        warnings.warn(
            f"genes= selects {len(names)} genes ({size / 2**20:.1f} MiB packed), over the "
            f"{GENE_EAGER_MAX_BYTES / 2**20:.0f} MiB eager limit; they load per gene on "
            "demand instead. Pass fewer genes to preload them.",
            UserWarning,
            stacklevel=3,
        )
        return [{"name": n} for n in names], _empty_payload()
    return pack_eager_gene_matrix(adata, names, n_points)
