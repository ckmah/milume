#!/usr/bin/env python3
"""Recompute the squidpy_svg neighbor mix and three Moran's I tables.

The notebook is not imported. Neighbor mix is row-normalized ``A @ one-hot``.
Moran's I is the centered formula on that row-normalized graph, checked
against ``sq.gr.spatial_autocorr``. Leftover expression is an independent
least-squares residual, checked against ``sc.pp.regress_out``.
"""

from __future__ import annotations

import sys
import time

import numpy as np
import pandas as pd
import scanpy as sc
import squidpy as sq

import milume as ml

N_NEIGHS = 6
PERCENTILE = 99
CELL_TYPE = "Enterocyte (top)"
MIN_DETECT = 0.05
TOP_N = 20
# A gene loses most of its all-cell score when leftover I is under half.
LOSE_FRAC = 0.5
I_ATOL = 1e-4
RESID_ATOL = 1e-3


def _row_normalize(graph):
    A = graph.tocsr().astype(np.float64).copy()
    row_sum = np.asarray(A.sum(axis=1)).ravel()
    scale = np.where(row_sum == 0, 1.0, row_sum)
    A.data = A.data / np.repeat(scale, np.diff(A.indptr))
    return A


def neighbor_mix(graph, cell_type: pd.Series) -> pd.DataFrame:
    onehot = pd.get_dummies(cell_type)
    A_norm = _row_normalize(graph)
    mix = pd.DataFrame(
        A_norm @ onehot.to_numpy(dtype=np.float64),
        index=cell_type.index,
        columns=onehot.columns,
    )
    return mix


def morans_i(graph, values: np.ndarray) -> np.ndarray:
    """Moran's I per column. ``values`` is cells by genes."""
    A = _row_normalize(graph)
    n = A.shape[0]
    s0 = float(A.sum())
    z = values - values.mean(axis=0, keepdims=True)
    wz = A @ z
    num = np.einsum("ij,ij->j", z, wz)
    den = np.einsum("ij,ij->j", z, z)
    with np.errstate(divide="ignore", invalid="ignore"):
        return (n / s0) * num / den


def _dense(matrix) -> np.ndarray:
    if hasattr(matrix, "toarray"):
        return np.asarray(matrix.toarray(), dtype=np.float64)
    return np.asarray(matrix, dtype=np.float64)


def leftover_matrix(values: np.ndarray, covariates: pd.DataFrame) -> np.ndarray:
    design = np.column_stack(
        [np.ones(len(covariates)), covariates.to_numpy(dtype=np.float64)]
    )
    coef, *_ = np.linalg.lstsq(design, values, rcond=None)
    return values - design @ coef


def _finite_max_abs(a: np.ndarray, b: np.ndarray) -> float:
    mask = np.isfinite(a) & np.isfinite(b)
    if not mask.any():
        raise SystemExit("no finite Moran's I values to compare")
    return float(np.max(np.abs(a[mask] - b[mask])))


def main() -> int:
    t0 = time.perf_counter()
    adata = ml.ds.ileum_merfish_xu2026()
    sq.gr.spatial_neighbors_knn(adata, n_neighs=N_NEIGHS, percentile=PERCENTILE)
    graph = adata.obsp["spatial_connectivities"]

    mix = neighbor_mix(graph, adata.obs["cell_type"])
    row_sums = mix.sum(axis=1).to_numpy()
    isolated = np.asarray(graph.sum(axis=1)).ravel() == 0
    connected = ~isolated
    if connected.any() and float(np.max(np.abs(row_sums[connected] - 1.0))) > 1e-5:
        print("neighbor mix rows do not sum to 1", file=sys.stderr)
        return 1
    if isolated.any() and float(np.max(np.abs(row_sums[isolated]))) > 1e-8:
        print("isolated cells have a nonzero neighbor mix", file=sys.stderr)
        return 1

    drop = adata.obs["cell_type"].value_counts().idxmax()
    own = (
        pd.get_dummies(adata.obs["cell_type"])
        .drop(columns=[drop])
        .astype(np.float64)
        .add_prefix("own_")
    )
    neigh = mix.drop(columns=[drop]).astype(np.float64).add_prefix("nb_")
    covariates = pd.concat([own, neigh], axis=1)
    if drop in covariates.columns or f"own_{drop}" in covariates.columns:
        print("dropped level still present", file=sys.stderr)
        return 1

    x = _dense(adata.X)
    genes = adata.var_names.astype(str)
    i_formula = morans_i(graph, x)
    moran_all = sq.gr.spatial_autocorr(adata, mode="moran", n_perms=None, copy=True)
    i_sq = moran_all["I"].reindex(genes).to_numpy()
    diff_all = _finite_max_abs(i_formula, i_sq)
    if diff_all > I_ATOL:
        print(f"all-cell Moran's I mismatch {diff_all}", file=sys.stderr)
        return 1

    resid_x = leftover_matrix(x, covariates)
    i_resid_formula = morans_i(graph, resid_x)
    resid = adata.copy()
    resid.obs = pd.concat([resid.obs, covariates], axis=1)
    sc.pp.regress_out(resid, list(covariates.columns))
    moran_resid = sq.gr.spatial_autocorr(resid, mode="moran", n_perms=None, copy=True)
    i_resid_sq = moran_resid["I"].reindex(genes).to_numpy()
    diff_resid = _finite_max_abs(i_resid_formula, i_resid_sq)
    if diff_resid > RESID_ATOL:
        print(f"leftover Moran's I mismatch {diff_resid}", file=sys.stderr)
        return 1

    same = adata[adata.obs["cell_type"] == CELL_TYPE].copy()
    n_type = int(same.n_obs)
    sq.gr.spatial_neighbors_knn(same, n_neighs=N_NEIGHS, percentile=PERCENTILE)
    detected = np.asarray((same.X > 0).mean(axis=0)).ravel()
    keep = detected >= MIN_DETECT
    same = same[:, keep].copy()
    within_genes = same.var_names.astype(str)
    i_within_formula = morans_i(same.obsp["spatial_connectivities"], _dense(same.X))
    moran_within = sq.gr.spatial_autocorr(same, mode="moran", n_perms=None, copy=True)
    i_within_sq = moran_within["I"].reindex(within_genes).to_numpy()
    diff_within = _finite_max_abs(i_within_formula, i_within_sq)
    if diff_within > I_ATOL:
        print(f"within-type Moran's I mismatch {diff_within}", file=sys.stderr)
        return 1

    scores = pd.DataFrame(
        {
            "gene": genes,
            "I_all": i_sq,
            "I_resid": i_resid_sq,
            "I_within": pd.Series(i_within_sq, index=within_genes).reindex(genes).to_numpy(),
        }
    )
    ranked = scores.sort_values("I_all", ascending=False)
    top = ranked.head(TOP_N)
    n_drop = int((top["I_resid"] < LOSE_FRAC * top["I_all"]).sum())
    top_all = str(ranked.iloc[0]["gene"])
    top_resid = str(scores.loc[scores["I_resid"].idxmax(), "gene"])
    elapsed = time.perf_counter() - t0
    print(
        "science check "
        f"n_cells={adata.n_obs} CELL_TYPE={CELL_TYPE!r} n_type={n_type} "
        f"top_all={top_all} top_resid={top_resid} n_drop={n_drop} TOP_N={TOP_N} "
        f"mix_isolated={int(isolated.sum())} "
        f"max_abs_I_all={diff_all:.3e} max_abs_I_resid={diff_resid:.3e} "
        f"max_abs_I_within={diff_within:.3e} seconds={elapsed:.1f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
