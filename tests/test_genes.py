import base64

import numpy as np
import pytest

from tests.helpers import adata_xy


def _widget(**kwargs):
    from spatial_rx import LandmarksWidget

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
    assert [g["name"] for g in w.gene_columns] == ["Apob", "Lgr5"]
    assert w.active_genes == []
    assert w.color_by == "categorical"
    assert w.gene_format == "dense"
    raw = np.frombuffer(base64.b64decode(w.gene_values), dtype=np.float32)
    for column in raw.reshape((4, 2), order="F").T:
        # Each gene is scaled to [0, 1] on its own range, order preserved.
        assert column.min() == 0.0 and column.max() == 1.0
        assert np.all(np.diff(column) >= 0)


@pytest.mark.parametrize(
    ("genes", "expected"), [(None, ["Apob", "Lgr5"]), ("Lgr5", ["Lgr5"])], ids=["all", "one"]
)
def test_genes_argument_selects_the_catalog(genes, expected):
    kwargs = {} if genes is None else {"genes": genes}
    assert [g["name"] for g in _widget(**kwargs).gene_columns] == expected


def test_set_expression_replaces_the_gene_catalog():
    w = _widget(genes=["Apob", "Lgr5"])
    w.active_genes = ["Apob", "Lgr5"]
    w.set_expression({"Lgr5": [0.0, 0.0, 0.5, 1.0]})
    assert [g["name"] for g in w.gene_columns] == ["Lgr5"]
    assert w.active_genes == ["Lgr5"]
    with pytest.raises(ValueError, match="n_points"):
        w.set_expression({"Lgr5": [0.0, 1.0]})


def test_log_scaled_expression_is_detected_from_uns_or_values():
    from spatial_rx import LandmarksWidget

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


def _decode_payload(payload, n_obs, n_vars):
    """Dense float32 (n_obs, n_vars) view of either payload format."""
    from scipy import sparse

    if payload["gene_format"] == "dense":
        raw = np.frombuffer(base64.b64decode(payload["gene_values"]), dtype=np.float32)
        return raw.reshape((n_obs, n_vars), order="F")
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

    from spatial_rx.genes import pack_eager_gene_matrix

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
    assert pay_s["gene_format"] == pay_d["gene_format"]
    np.testing.assert_allclose(
        _decode_payload(pay_s, n_obs, n_vars),
        _decode_payload(pay_d, n_obs, n_vars),
        rtol=1e-6,
        atol=1e-7,
    )


def test_sparse_pack_respects_catalog_order_and_subset():
    from scipy import sparse

    from spatial_rx.genes import pack_eager_gene_matrix

    dense = _awkward_sparse_matrix()
    n_obs = dense.shape[0]
    names = ["g5", "g0", "g3"]
    meta_s, pay_s = pack_eager_gene_matrix(
        _plain_adata(sparse.csr_matrix(dense)), names, n_obs
    )
    _, pay_d = pack_eager_gene_matrix(_plain_adata(dense), names, n_obs)
    assert [m["name"] for m in meta_s] == names
    assert pay_s["gene_format"] == pay_d["gene_format"]
    np.testing.assert_allclose(
        _decode_payload(pay_s, n_obs, 3), _decode_payload(pay_d, n_obs, 3), rtol=1e-6
    )


def test_sparse_pack_csc_input_matches_and_leaves_x_untouched():
    from scipy import sparse

    from spatial_rx.genes import pack_eager_gene_matrix

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

    from spatial_rx.genes import pack_eager_gene_matrix

    _, pay = pack_eager_gene_matrix(
        _plain_adata(sparse.csr_matrix((10, 2), dtype=np.float32)), ["g0", "g1"], 10
    )
    assert not _decode_payload(pay, 10, 2).any()


def test_sparse_pack_does_not_densify():
    """Peak allocation stays far below the dense n_obs x n_genes float32 matrix."""
    import tracemalloc

    from scipy import sparse

    from spatial_rx import genes

    n_obs, n_vars = 100_000, 200
    rng = np.random.default_rng(0)
    csr = sparse.random(
        n_obs, n_vars, density=0.01, format="csr", random_state=rng, dtype=np.float32
    )
    csr.data *= 10.0
    adata = _plain_adata(csr)
    names = [f"g{j}" for j in range(n_vars)]
    dense_bytes = n_obs * n_vars * 4  # ~76 MiB

    tracemalloc.start()
    try:
        _, payload = genes.pack_eager_gene_matrix(adata, names, n_obs)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert payload["gene_format"] == "csc"
    assert peak < dense_bytes / 4


def test_size_warning_reports_bytes_sent(monkeypatch):
    import warnings

    from scipy import sparse

    from spatial_rx import genes

    rng = np.random.default_rng(5)
    csr = sparse.random(
        2000, 50, density=0.02, format="csr", random_state=rng, dtype=np.float32
    )
    csr.data += 1.0
    names = [f"g{j}" for j in range(50)]
    monkeypatch.setattr(genes, "GENE_MATRIX_WARN_BYTES", 1024)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        _, payload = genes.pack_eager_gene_matrix(_plain_adata(csr), names, 2000)
    assert payload["gene_format"] == "csc"
    nnz = np.frombuffer(
        base64.b64decode(payload["gene_csc_data"]), dtype=np.float32
    ).size
    sent = 4 * (50 + 1) + 8 * nnz
    msgs = [str(w.message) for w in caught if issubclass(w.category, UserWarning)]
    assert len(msgs) == 1
    assert f"{sent / (1024 ** 2):.1f} MiB" in msgs[0]
    assert "csc" in msgs[0] and f"{nnz} nonzeros" in msgs[0]

    # Below the threshold for what is sent: no warning, though dense would exceed it.
    monkeypatch.setattr(genes, "GENE_MATRIX_WARN_BYTES", sent)
    assert 2000 * 50 * 4 > sent
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        genes.pack_eager_gene_matrix(_plain_adata(csr), names, 2000)
    assert not [w for w in caught if issubclass(w.category, UserWarning)]


def test_size_warning_dense_input_reports_dense_bytes(monkeypatch):
    import warnings

    from spatial_rx import genes

    rng = np.random.default_rng(6)
    dense = (rng.random((300, 4)) + 0.1).astype(np.float32)
    monkeypatch.setattr(genes, "GENE_MATRIX_WARN_BYTES", 1024)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        _, payload = genes.pack_eager_gene_matrix(
            _plain_adata(dense), [f"g{j}" for j in range(4)], 300
        )
    assert payload["gene_format"] == "dense"
    msgs = [str(w.message) for w in caught if issubclass(w.category, UserWarning)]
    assert len(msgs) == 1
    assert f"{300 * 4 * 4 / (1024 ** 2):.1f} MiB" in msgs[0] and "dense" in msgs[0]
