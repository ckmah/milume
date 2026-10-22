import base64

import numpy as np
import pytest

from tests.helpers import adata_xy


def _widget(**kwargs):
    from milume import LandmarksWidget

    adata = adata_xy(
        [0.0, 1.0, 2.0, 3.0],
        [0.0, 1.0, 0.0, 1.0],
        color=["Epi", "Imm", "Epi", "Fib"],
        color_key="cell_class",
        genes={"Apob": [0.0, 1.0, 2.0, 4.0], "Lgr5": [0.0, 0.0, 0.5, 1.0]},
    )
    return LandmarksWidget(adata, color="cell_class", **kwargs)


def test_requested_genes_are_packed_normalised_per_gene():
    w = _widget(genes=["Apob", "Lgr5"])
    assert [g["name"] for g in w.gene_names] == ["Apob", "Lgr5"]
    assert w.active_genes == []
    assert w.color_mode == "categorical"
    for column in _decode_payload(_payload(w), 4, 2).T:
        # Each gene is scaled to [0, 1] on its own range, order preserved.
        assert column.min() == 0.0 and column.max() == 1.0
        assert np.all(np.diff(column) >= 0)


@pytest.mark.parametrize(
    ("genes", "expected"), [(None, ["Apob", "Lgr5"]), ("Lgr5", ["Lgr5"])], ids=["all", "one"]
)
def test_genes_argument_selects_the_catalog(genes, expected):
    kwargs = {} if genes is None else {"genes": genes}
    assert [g["name"] for g in _widget(**kwargs).gene_names] == expected


def test_set_expression_replaces_the_gene_catalog():
    w = _widget(genes=["Apob", "Lgr5"])
    w.active_genes = ["Apob", "Lgr5"]
    w.set_expression({"Lgr5": [0.0, 0.0, 0.5, 1.0]})
    assert [g["name"] for g in w.gene_names] == ["Lgr5"]
    assert w.active_genes == ["Lgr5"]
    with pytest.raises(ValueError, match="n_points"):
        w.set_expression({"Lgr5": [0.0, 1.0]})


def test_log_scaled_expression_is_detected_from_uns_or_values():
    from milume import LandmarksWidget

    def widget(values, uns=None):
        adata = adata_xy(
            [0.0, 1.0, 2.0, 3.0], [0.0, 1.0, 0.0, 1.0], genes={"g": values}, uns=uns
        )
        return LandmarksWidget(adata, genes=["g"])

    assert widget([0.0, 1.0, 2.0, 40.0]).gene_expression_logged is False
    assert widget([0.0, 0.5, 1.2, 3.4]).gene_expression_logged is True
    marked = widget([1.0, 2.0, 3.0, 40.0], uns={"log1p": {"base": None}})
    assert marked.gene_expression_logged is True
    # Already-logged data is not logged again.
    assert marked.gene_log1p is False


def _plain_adata(X):
    import anndata as ad
    import pandas as pd

    n_obs, n_vars = X.shape
    obs = pd.DataFrame(index=[f"c{i}" for i in range(n_obs)])
    var = pd.DataFrame(index=[f"g{j}" for j in range(n_vars)])
    return ad.AnnData(X=X, obs=obs, var=var)


def _payload(w):
    return {k: getattr(w, k) for k in ("gene_csc_indptr", "gene_csc_indices", "gene_csc_data")}


def _decode_payload(payload, n_obs, n_vars):
    """Dense float32 (n_obs, n_vars) view of the eager CSC pack (test-only)."""
    from scipy import sparse

    def decode(key, dtype):
        return np.frombuffer(base64.b64decode(payload[key]), dtype=dtype)

    indptr = decode("gene_csc_indptr", np.int32)
    indices = decode("gene_csc_indices", np.int32)
    data = decode("gene_csc_data", np.float32)
    assert indptr.size == n_vars + 1
    return sparse.csc_matrix((data, indices, indptr), shape=(n_obs, n_vars)).toarray()


def _awkward_sparse_matrix():
    """Columns that stress sparse vs dense normalization parity."""
    rng = np.random.default_rng(7)
    n_obs = 400
    cols = []
    # Typical counts, ~5% nonzero.
    cols.append(np.where(rng.random(n_obs) < 0.05, rng.integers(1, 50, n_obs), 0))
    # All zeros.
    cols.append(np.zeros(n_obs))
    # Negative values (implicit zeros normalize above 0).
    neg = np.zeros(n_obs)
    neg[rng.choice(n_obs, 20, replace=False)] = rng.normal(0, 2, 20)
    cols.append(neg)
    # NaN and inf among the stored entries.
    bad = np.zeros(n_obs)
    bad[:10] = rng.random(10) * 5
    bad[10] = np.nan
    bad[11] = np.inf
    cols.append(bad)
    # Fully stored column (no implicit zeros), all positive.
    cols.append(rng.random(n_obs) + 0.5)
    # Single nonzero entry (99th percentile lands on implicit zeros).
    one = np.zeros(n_obs)
    one[3] = 9.0
    cols.append(one)
    return np.column_stack(cols).astype(np.float32)


def test_sparse_pack_matches_dense_pack():
    from scipy import sparse

    from milume.genes import pack_eager_gene_matrix

    csr = sparse.csr_matrix(_awkward_sparse_matrix())
    # Explicitly stored zeros must be treated like implicit zeros.
    csr.data[::7] = 0.0
    dense = csr.toarray()
    n_obs, n_vars = dense.shape
    names = [f"g{j}" for j in range(n_vars)]

    meta_s, pay_s = pack_eager_gene_matrix(_plain_adata(csr), names, n_obs)
    meta_d, pay_d = pack_eager_gene_matrix(_plain_adata(dense), names, n_obs)

    assert [m["name"] for m in meta_s] == names
    for ms, md in zip(meta_s, meta_d):
        assert ms["vmin"] == pytest.approx(md["vmin"], rel=1e-12, abs=1e-12)
        assert ms["vmax"] == pytest.approx(md["vmax"], rel=1e-12, abs=1e-12)
    np.testing.assert_allclose(
        _decode_payload(pay_s, n_obs, n_vars),
        _decode_payload(pay_d, n_obs, n_vars),
        rtol=1e-6,
        atol=1e-7,
    )


def test_sparse_pack_respects_catalog_order_and_subset():
    from scipy import sparse

    from milume.genes import pack_eager_gene_matrix

    dense = _awkward_sparse_matrix()
    n_obs = dense.shape[0]
    names = ["g5", "g0", "g3"]
    meta_s, pay_s = pack_eager_gene_matrix(
        _plain_adata(sparse.csr_matrix(dense)), names, n_obs
    )
    _, pay_d = pack_eager_gene_matrix(_plain_adata(dense), names, n_obs)
    assert [m["name"] for m in meta_s] == names
    np.testing.assert_allclose(
        _decode_payload(pay_s, n_obs, 3), _decode_payload(pay_d, n_obs, 3), rtol=1e-6
    )


def test_sparse_pack_csc_input_matches_and_leaves_x_untouched():
    from scipy import sparse

    from milume.genes import pack_eager_gene_matrix

    dense = _awkward_sparse_matrix()
    n_obs, n_vars = dense.shape
    names = [f"g{j}" for j in range(n_vars)]
    csc = sparse.csc_matrix(dense)
    # Force the canonicalize path; the caller's arrays must not be rewritten.
    csc.has_canonical_format = False
    before = (csc.indptr.copy(), csc.indices.copy(), csc.data.copy())

    _, pay_s = pack_eager_gene_matrix(_plain_adata(csc), names, n_obs)
    _, pay_d = pack_eager_gene_matrix(_plain_adata(dense), names, n_obs)
    np.testing.assert_allclose(
        _decode_payload(pay_s, n_obs, n_vars),
        _decode_payload(pay_d, n_obs, n_vars),
        rtol=1e-6,
        atol=1e-7,
    )
    np.testing.assert_array_equal(csc.indptr, before[0])
    np.testing.assert_array_equal(csc.indices, before[1])
    np.testing.assert_array_equal(csc.data, before[2])


def test_sparse_pack_of_an_all_zero_matrix_decodes_to_zeros():
    from scipy import sparse

    from milume.genes import pack_eager_gene_matrix

    _, pay = pack_eager_gene_matrix(
        _plain_adata(sparse.csr_matrix((10, 2), dtype=np.float32)), ["g0", "g1"], 10
    )
    assert not _decode_payload(pay, 10, 2).any()


def test_gene_slices_do_not_densify():
    """Slicing a few genes allocates far less than one dense n_obs x n_genes matrix."""
    import tracemalloc

    from scipy import sparse

    from milume import genes

    n_obs, n_vars = 100_000, 200
    rng = np.random.default_rng(0)
    csr = sparse.random(
        n_obs, n_vars, density=0.01, format="csr", random_state=rng, dtype=np.float32
    )
    csr.data *= 10.0
    adata = _plain_adata(csr)
    dense_bytes = n_obs * n_vars * 4  # ~76 MiB

    tracemalloc.start()
    try:
        genes.pack_eager_gene_matrix(adata, [f"g{j}" for j in range(n_vars)], n_obs)
        _, peak_all = tracemalloc.get_traced_memory()
        tracemalloc.reset_peak()
        genes.gene_slices(adata, ["g3", "g7"])
        _, peak_two = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert peak_all < dense_bytes / 4
    assert peak_two < dense_bytes / 50


def _sparse_widget(n_obs, n_vars, density, **kwargs):
    from scipy import sparse

    from milume import LandmarksWidget

    rng = np.random.default_rng(3)
    X = sparse.random(n_obs, n_vars, density=density, format="csr", random_state=rng, dtype=np.float32)
    X.data = np.ceil(X.data * 20.0)
    adata = _plain_adata(X)
    adata.obsm["spatial"] = rng.random((n_obs, 2)) * 100.0
    return adata, LandmarksWidget(adata, **kwargs)


def test_default_construct_sends_names_only():
    import json

    adata, w = _sparse_widget(20_000, 2_000, 0.1)
    assert [g["name"] for g in w.gene_names] == list(adata.var_names)
    assert all(set(g) == {"name"} for g in w.gene_names)
    assert (w.gene_csc_indptr, w.gene_csc_indices, w.gene_csc_data) == ("", "", "")
    # The eager pack would be ~32 MiB; comm-open carries points + names only.
    state = w.get_state()
    gene_bytes = sum(len(json.dumps(v)) for k, v in state.items() if k.startswith("gene"))
    assert gene_bytes < 64 * 1024
    assert w.active_genes == []


def test_gene_get_returns_normalized_sparse_slices():
    from milume.genes import _normalize_column

    adata, w = _sparse_widget(3_000, 40, 0.05)
    names = ["g7", "g0", "g31"]
    resp, buffers = w._gene_get({"names": names}, [])
    assert resp["ok"] is True
    assert [g["name"] for g in resp["genes"]] == names
    rows = np.frombuffer(buffers[0], dtype=np.int32)
    vals = np.frombuffer(buffers[1], dtype=np.float32)
    assert rows.size == vals.size == sum(g["nnz"] for g in resp["genes"])
    dense = adata.X.toarray()
    start = 0
    for g in resp["genes"]:
        j = int(g["name"][1:])
        expected, vmin, vmax = _normalize_column(dense[:, j].astype(np.float64))
        got = np.zeros(dense.shape[0], dtype=np.float32)
        got[rows[start : start + g["nnz"]]] = vals[start : start + g["nnz"]]
        start += g["nnz"]
        np.testing.assert_allclose(got, expected, rtol=1e-6, atol=1e-7)
        assert g["vmin"] == pytest.approx(vmin) and g["vmax"] == pytest.approx(vmax)


@pytest.mark.parametrize(
    ("msg", "status"),
    [
        ({"names": ["nope"]}, 404),
        ({"names": []}, 400),
        ({"names": "g0"}, 400),
        ({"names": [f"g{j}" for j in range(17)]}, 400),
        ("g0", 400),
    ],
    ids=["unknown", "empty", "not-a-list", "too-many", "not-a-dict"],
)
def test_gene_get_rejects_bad_requests(msg, status):
    _, w = _sparse_widget(500, 40, 0.05)
    resp, buffers = w._gene_get(msg, [])
    assert resp["ok"] is False and resp["status"] == status and buffers == []


def test_colour_by_a_lazy_gene_sets_its_range():
    _, w = _sparse_widget(2_000, 30, 0.1)
    w.color = "g4"
    assert w.active_genes == ["g4"] and w.color_mode == "continuous"
    resp, _ = w._gene_get({"names": ["g4"]}, [])
    assert (w.color_vmin, w.color_vmax) == (resp["genes"][0]["vmin"], resp["genes"][0]["vmax"])


def test_genes_allowlist_is_packed_eagerly():
    adata, w = _sparse_widget(2_000, 30, 0.1, genes=["g2", "g9"])
    assert [g["name"] for g in w.gene_names] == ["g2", "g9"]
    assert all({"vmin", "vmax"} <= set(g) for g in w.gene_names)
    packed = _decode_payload(_payload(w), 2_000, 2)
    resp, buffers = w._gene_get({"names": ["g2", "g9"]}, [])
    rows = np.frombuffer(buffers[0], dtype=np.int32)
    vals = np.frombuffer(buffers[1], dtype=np.float32)
    nnz0 = resp["genes"][0]["nnz"]
    fetched = np.zeros((2_000, 2), dtype=np.float32)
    fetched[rows[:nnz0], 0] = vals[:nnz0]
    fetched[rows[nnz0:], 1] = vals[nnz0:]
    np.testing.assert_array_equal(packed, fetched)


def test_oversized_allowlist_falls_back_to_on_demand(monkeypatch):
    import warnings

    from milume import genes

    monkeypatch.setattr(genes, "GENE_EAGER_MAX_BYTES", 1024)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        _, w = _sparse_widget(2_000, 30, 0.1, genes=["g2", "g9", "g11"])
    msgs = [str(x.message) for x in caught if issubclass(x.category, UserWarning)]
    assert len(msgs) == 1 and "eager limit" in msgs[0] and "genes=" in msgs[0]
    assert [g["name"] for g in w.gene_names] == ["g2", "g9", "g11"]
    assert w.gene_csc_data == ""
    # Still restricted to the allowlist, and still fetchable.
    assert w._gene_get({"names": ["g9"]}, [])[0]["ok"] is True
    assert w._gene_get({"names": ["g3"]}, [])[0]["status"] == 404


def test_eager_gate_counts_stored_entries():
    from scipy import sparse

    from milume.genes import eager_pack_bytes

    X = sparse.csr_matrix(np.array([[1, 0, 2], [0, 0, 3], [4, 0, 0]], dtype=np.float32))
    adata = _plain_adata(X)
    assert eager_pack_bytes(adata, ["g0", "g2"]) == 4 * 3 + 8 * 4
    assert eager_pack_bytes(_plain_adata(sparse.csc_matrix(X)), ["g1"]) == 4 * 2
    assert eager_pack_bytes(_plain_adata(X.toarray()), ["g1"]) == 4 * 2 + 8 * 3


def test_colouring_by_a_gene_outside_the_catalog_errors():
    from milume import ColorValueError

    _, w = _sparse_widget(500, 10, 0.2, genes=["g1"])
    with pytest.raises(ColorValueError, match="genes="):
        w.color = "g2"


def _csr_edge_matrix():
    """CSR with empty rows, a row holding every column, explicit zeros and negatives."""
    from scipy import sparse

    rng = np.random.default_rng(11)
    n_obs, n_vars = 400, 37
    dense = rng.integers(-3, 9, (n_obs, n_vars)).astype(np.float32)
    dense[rng.random((n_obs, n_vars)) < 0.8] = 0.0
    dense[5] = 0.0  # empty row
    dense[-1] = 0.0  # empty last row
    dense[7] = np.arange(1, n_vars + 1)  # full row
    dense[:, 4] = 0.0  # empty column
    X = sparse.csr_matrix(dense)
    X.data[X.indptr[10]] = 0.0  # explicit stored zero (scipy keeps it)
    return X


@pytest.mark.parametrize("index_dtype", [np.int32, np.int64])
@pytest.mark.parametrize(("chunk_rows", "min_rows"), [(7, 1), (64, 3), (1 << 16, 1 << 10)])
def test_csr_columns_match_scipy_column_slices(index_dtype, chunk_rows, min_rows, monkeypatch):
    """The per-row search returns exactly ``X[:, idx]``, entries and stored zeros alike."""
    from scipy import sparse

    from milume import genes
    from milume.genes import _csr_columns

    monkeypatch.setattr(genes, "_CSR_SEARCH_ROWS", chunk_rows)
    monkeypatch.setattr(genes, "_CSR_SEARCH_MIN_ROWS", min_rows)
    X = _csr_edge_matrix()
    X.indices = X.indices.astype(index_dtype)
    X.indptr = X.indptr.astype(index_dtype)
    assert X.has_canonical_format
    idx = [0, 3, 4, 36, 17, 3]
    got = _csr_columns(X, idx)
    want = sparse.csc_matrix(X[:, idx])
    assert got.shape == want.shape
    np.testing.assert_array_equal(got.indptr, want.indptr)
    np.testing.assert_array_equal(got.indices, want.indices)
    np.testing.assert_array_equal(got.data, want.data)
    assert got.data.dtype == X.dtype
    empty = _csr_columns(sparse.csr_matrix((6, 3), dtype=np.float32), [2, 0])
    assert empty.shape == (6, 2) and empty.nnz == 0


def _slices_by_layout(X):
    from scipy import sparse

    from milume.genes import gene_slices

    names = [f"g{j}" for j in (0, 3, 4, 36, 17)]
    layouts = {
        "csr": sparse.csr_matrix(X),
        "csc": sparse.csc_matrix(X),
        "dense": np.asarray(X.toarray()),
    }
    return {k: gene_slices(_plain_adata(v), names) for k, v in layouts.items()}


def test_gene_slices_identical_for_csr_csc_and_dense():
    out = _slices_by_layout(_csr_edge_matrix())
    for layout in ("csc", "dense"):
        for (m_csr, r_csr, v_csr), (m, r, v) in zip(out["csr"], out[layout], strict=True):
            assert m_csr == m, layout
            np.testing.assert_array_equal(r_csr, r)
            np.testing.assert_array_equal(v_csr, v)


def test_gene_slices_on_non_canonical_csr_sum_duplicates():
    """Duplicate or unsorted CSR entries fall back to scipy's scan and still sum."""
    from scipy import sparse

    from milume.genes import gene_slices

    data = np.array([2.0, 3.0, 5.0, 1.0], dtype=np.float32)
    # Row 0 stores column 1 twice (2 + 5) around column 2, so it is unsorted too.
    indices = np.array([1, 2, 1, 0], dtype=np.int32)
    X = sparse.csr_matrix((data, indices, np.array([0, 3, 4])), shape=(2, 3))
    assert not X.has_canonical_format
    (meta, rows, vals), = gene_slices(_plain_adata(X), ["g1"])
    np.testing.assert_array_equal(rows, [0])
    assert meta["vmax"] == pytest.approx(7.0 * 0.99)  # p99 of the summed column [7, 0]
    assert vals[0] == pytest.approx(1.0)


def test_gene_get_bytes_identical_for_csr_csc_and_dense():
    from scipy import sparse

    from milume import LandmarksWidget

    X = _csr_edge_matrix()
    rng = np.random.default_rng(2)
    xy = rng.random((X.shape[0], 2)) * 100.0
    names = ["g36", "g0", "g4", "g7"]
    replies = {}
    for layout, M in {"csr": X, "csc": sparse.csc_matrix(X), "dense": X.toarray()}.items():
        adata = _plain_adata(M)
        adata.obsm["spatial"] = xy
        replies[layout] = LandmarksWidget(adata)._gene_get({"names": names}, [])
    assert replies["csr"][0]["ok"] is True
    assert replies["csr"] == replies["csc"] == replies["dense"]
