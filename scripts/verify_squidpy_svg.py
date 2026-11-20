#!/usr/bin/env python3
"""Recompute every number the squidpy_svg prose prints.

The notebook is not imported. Spatial domain uses the same Squidpy niche call
as the color recipe. Moran's I is the centered formula on the row-normalized
graph, checked against ``sq.gr.spatial_autocorr``. Leftover expression is an
independent least-squares residual, checked against ``sc.pp.regress_out``.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import scanpy as sc
import squidpy as sq

import milume as ml

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "demos" / "recipes" / "squidpy_svg.py"

N_NEIGHS = 6
PERCENTILE = 99
MIN_DETECT = 0.01
TOP_N = 20
DOMAIN_K = 30
DOMAIN_NEIGHBORS = 15
DOMAIN_RES = 0.3
ENTEROCYTE = ["Enterocyte (bottom)", "Enterocyte (mid)", "Enterocyte (top)"]
LOSE_FRAC = 0.5
I_ATOL = 1e-4
RESID_ATOL = 1e-3

ADMONITION = """\
/// warning | Enterocyte subtypes are positions
Xu et al. split enterocytes into bottom, mid and top by where they sit along the villus, not by an independent marker. Those labels already carry the villus gradient. When the leftover score regresses out cell type, it also regresses out position, so zonated genes like Apob lose most of their score by construction rather than because they lack a pattern. The same goes for testing within "Enterocyte (top)" alone: that slice covers only a thin band of the villus, so a gradient has little room to show. To see zonation, select all three enterocyte subtypes together, then color Apob.
///"""


def fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


def row_normalize(graph):
    A = graph.tocsr().astype(np.float64).copy()
    row_sum = np.asarray(A.sum(axis=1)).ravel()
    scale = np.where(row_sum == 0, 1.0, row_sum)
    A.data = A.data / np.repeat(scale, np.diff(A.indptr))
    return A


def morans_i(graph, values: np.ndarray) -> np.ndarray:
    """Moran's I per column. ``values`` is cells by genes."""
    A = row_normalize(graph)
    n = A.shape[0]
    s0 = float(A.sum())
    z = values - values.mean(axis=0, keepdims=True)
    num = np.einsum("ij,ij->j", z, A @ z)
    den = np.einsum("ij,ij->j", z, z)
    with np.errstate(divide="ignore", invalid="ignore"):
        return (n / s0) * num / den


def dense(matrix) -> np.ndarray:
    if hasattr(matrix, "toarray"):
        return np.asarray(matrix.toarray(), dtype=np.float64)
    return np.asarray(matrix, dtype=np.float64)


def leftover_matrix(values: np.ndarray, covariates: pd.DataFrame) -> np.ndarray:
    design = np.column_stack(
        [np.ones(len(covariates)), covariates.to_numpy(dtype=np.float64)]
    )
    coef, *_ = np.linalg.lstsq(design, values, rcond=None)
    return values - design @ coef


def finite_max_abs(a: np.ndarray, b: np.ndarray) -> float:
    mask = np.isfinite(a) & np.isfinite(b)
    if not mask.any():
        raise SystemExit("no finite Moran's I values to compare")
    return float(np.max(np.abs(a[mask] - b[mask])))


def spatial_domain(adata) -> None:
    sq.gr.spatial_neighbors(adata, coord_type="generic", n_neighs=DOMAIN_K)
    if hasattr(sq.gr, "calculate_niche_neighborhood"):
        sq.gr.calculate_niche_neighborhood(
            adata,
            groups="cell_type",
            scale=False,
            n_neighbors=DOMAIN_NEIGHBORS,
            resolutions=[DOMAIN_RES],
            rng=0,
        )
    else:
        sq.gr.calculate_niche(
            adata,
            flavor="neighborhood",
            groups="cell_type",
            scale=False,
            n_neighbors=DOMAIN_NEIGHBORS,
            resolutions=[DOMAIN_RES],
            random_state=0,
        )
    niche_col = f"nhood_niche_res={DOMAIN_RES}"
    adata.obs["spatial domain"] = adata.obs[niche_col].astype(str)


def covariates_for(adata) -> pd.DataFrame:
    own = pd.get_dummies(adata.obs["cell_type"]).astype(np.float64)
    own = own.drop(columns=[own.sum().idxmax()]).add_prefix("own_")
    domain = pd.get_dummies(adata.obs["spatial domain"]).astype(np.float64)
    domain = domain.drop(columns=[domain.sum().idxmax()]).add_prefix("domain_")
    return pd.concat([own, domain], axis=1)


def zonation(enterocytes: pd.DataFrame, gene: str):
    ps = enterocytes.obs["mucosal_pseudospace"]
    low = ps <= ps.quantile(0.2)
    high = ps >= ps.quantile(0.8)
    raw = enterocytes[:, gene].X
    expr = pd.Series(dense(raw).ravel(), index=enterocytes.obs_names)
    return (
        float(expr.corr(ps, method="spearman")),
        float(expr[low].mean()),
        float(expr[high].mean()),
    )


def check_notebook(source: str) -> int:
    missing_lines = [line for line in ADMONITION.splitlines() if line not in source]
    if missing_lines:
        return fail("enterocyte-position admonition is missing or not verbatim")
    if "Il12b" in source:
        return fail("Il12b is still in the notebook")
    required = [
        '{acta2["I_all"]:.2f}',
        '{acta2["I_resid"]:.2f}',
        '{acta2["I_within"]:.2f}',
        '{apob["I_within"]:.2f}',
        "{apob_rho:.2f}",
        "{apob_low:.2f}",
        "{apob_high:.2f}",
        "{dhx58_rho:.2f}",
        '{int(dhx58["rank_all"])}',
        '{int(dhx58["rank_resid"])}',
        "{nt5e_low:.2f}",
        "{nt5e_high:.2f}",
        "{nt5e_rho:.2f}",
        "{cps1_low:.2f}",
        "{cps1_high:.2f}",
        "{cps1_rho:.2f}",
        "{il22_n}",
        "{il22_ent_n}",
        "{il22_i_all:.2f}",
        "{il22_i_resid:.2f}",
        "{n_cells}",
        "{n_scored}",
        "{n_within}",
        "{n_domains}",
        "{n_drop}",
        "{TOP_N}",
        '{top_resid_row["gene"]}',
        '{top_resid_row["I_resid"]:.2f}',
    ]
    missing = [item for item in required if item not in source]
    if missing:
        return fail("prose is missing computed placeholders: " + ", ".join(missing))
    visible = [
        "keep_all = np.asarray((adata.X > 0).mean(axis=0)).ravel() >= MIN_DETECT",
        "keep_resid = keep_all",
        "keep_within = np.asarray((enterocytes.X > 0).mean(axis=0)).ravel() >= MIN_DETECT",
        "keep_selected = np.asarray((selected.X > 0).mean(axis=0)).ravel() >= MIN_DETECT",
        'del adata.obsm["niche_embedding"]',
    ]
    missing_lines = [line for line in visible if line not in source]
    if missing_lines:
        return fail("scoring cell is missing a visible floor or the embedding drop")
    return 0


def main() -> int:
    source = NOTEBOOK.read_text(encoding="utf-8")
    if check_notebook(source):
        return 1

    t0 = time.perf_counter()
    adata = ml.ds.ileum_merfish_xu2026()
    labels = set(adata.obs["cell_type"].astype(str))
    if not set(ENTEROCYTE).issubset(labels):
        return fail("positional enterocyte labels are missing")
    if "Enterocyte" in labels:
        return fail("positional enterocyte labels were merged")

    spatial_domain(adata)
    if adata.obs["spatial domain"].nunique() < 2:
        return fail("spatial domain has fewer than two levels")
    covariates = covariates_for(adata)
    if any(name.startswith("nb_") for name in covariates.columns):
        return fail("neighbor-mix covariates are still present")
    for label in ("Enterocyte (bottom)", "Enterocyte (top)"):
        if f"own_{label}" not in covariates.columns:
            return fail(f"{label} was merged out of the own-type block")

    sq.gr.spatial_neighbors_knn(adata, n_neighs=N_NEIGHS, percentile=PERCENTILE)
    keep_all = np.asarray((adata.X > 0).mean(axis=0)).ravel() >= MIN_DETECT
    keep_resid = keep_all
    genes = adata.var_names.astype(str)
    if "Il12b" in set(genes[keep_all]):
        return fail("Il12b passed the all-cell 1% floor")
    if not np.array_equal(keep_resid, keep_all):
        return fail("leftover floor is not the all-cell floor")
    scored = adata[:, keep_all].copy()
    values = dense(scored.X)
    i_formula = morans_i(scored.obsp["spatial_connectivities"], values)
    moran_all = sq.gr.spatial_autocorr(scored, mode="moran", n_perms=None, copy=True)
    i_sq = moran_all["I"].reindex(scored.var_names).to_numpy()
    diff_all = finite_max_abs(i_formula, i_sq)
    if diff_all > I_ATOL:
        return fail(f"all-cell Moran's I mismatch {diff_all}")

    resid_x = leftover_matrix(values, covariates)
    i_resid_formula = morans_i(scored.obsp["spatial_connectivities"], resid_x)
    resid = scored.copy()
    resid.obs = pd.concat([resid.obs, covariates], axis=1)
    sc.pp.regress_out(resid, list(covariates.columns))
    moran_resid = sq.gr.spatial_autocorr(resid, mode="moran", n_perms=None, copy=True)
    i_resid_sq = moran_resid["I"].reindex(scored.var_names).to_numpy()
    diff_resid = finite_max_abs(i_resid_formula, i_resid_sq)
    if diff_resid > RESID_ATOL:
        return fail(f"leftover Moran's I mismatch {diff_resid}")

    enterocytes = adata[adata.obs["cell_type"].isin(ENTEROCYTE)].copy()
    sq.gr.spatial_neighbors_knn(enterocytes, n_neighs=N_NEIGHS, percentile=PERCENTILE)
    keep_within = np.asarray((enterocytes.X > 0).mean(axis=0)).ravel() >= MIN_DETECT
    ent_scored = enterocytes[:, keep_within].copy()
    i_within_formula = morans_i(
        ent_scored.obsp["spatial_connectivities"], dense(ent_scored.X)
    )
    moran_within = sq.gr.spatial_autocorr(
        ent_scored, mode="moran", n_perms=None, copy=True
    )
    i_within_sq = moran_within["I"].reindex(ent_scored.var_names).to_numpy()
    diff_within = finite_max_abs(i_within_formula, i_within_sq)
    if diff_within > I_ATOL:
        return fail(f"within-enterocyte Moran's I mismatch {diff_within}")

    scores = pd.DataFrame(
        {
            "gene": scored.var_names.astype(str),
            "I_all": i_sq,
            "I_resid": i_resid_sq,
        }
    )
    scores["I_within"] = (
        pd.Series(i_within_sq, index=ent_scored.var_names.astype(str))
        .reindex(scores["gene"])
        .to_numpy()
    )
    scores["rank_all"] = scores["I_all"].rank(ascending=False, method="min")
    scores["rank_resid"] = scores["I_resid"].rank(ascending=False, method="min")
    top = scores.sort_values("I_all", ascending=False).head(TOP_N)
    n_drop = int((top["I_resid"] < LOSE_FRAC * top["I_all"]).sum())
    top_resid_row = top.sort_values("I_resid", ascending=False).iloc[0]
    if int(scores.loc[scores["gene"] == "Acta2", "rank_all"].iloc[0]) != 1:
        return fail("Acta2 is not the top all-cell gene")

    def one(gene: str) -> pd.Series:
        return scores.loc[scores["gene"] == gene].iloc[0]

    acta2, apob, dhx58 = one("Acta2"), one("Apob"), one("Dhx58")
    within_i = pd.Series(i_within_sq, index=ent_scored.var_names.astype(str))
    rank_within = within_i.rank(ascending=False, method="min")
    rank_within_allcell = within_i[within_i.index.isin(scores["gene"])].rank(
        ascending=False, method="min"
    )
    within_only = sorted(set(within_i.index) - set(scores["gene"]))
    moved = [
        gene
        for gene in rank_within_allcell.index
        if int(rank_within[gene]) != int(rank_within_allcell[gene])
    ]
    apob_rho, apob_low, apob_high = zonation(enterocytes, "Apob")
    nt5e_rho, nt5e_low, nt5e_high = zonation(enterocytes, "Nt5e")
    cps1_rho, cps1_low, cps1_high = zonation(enterocytes, "Cps1")
    dhx58_rho, _, _ = zonation(enterocytes, "Dhx58")

    il22_expr = dense(adata[:, "Il22ra2"].X).ravel()
    il22_n = int((il22_expr > 0).sum())
    il22_ent_n = int((dense(enterocytes[:, "Il22ra2"].X).ravel() > 0).sum())
    if il22_n / adata.n_obs >= MIN_DETECT or il22_ent_n / enterocytes.n_obs >= MIN_DETECT:
        return fail("Il22ra2 passed a floor the prose says it fails")
    graph = row_normalize(adata.obsp["spatial_connectivities"])
    il22_left = leftover_matrix(il22_expr.reshape(-1, 1), covariates).ravel()
    il22_i_all = float(morans_i(graph, il22_expr.reshape(-1, 1))[0])
    il22_i_resid = float(morans_i(graph, il22_left.reshape(-1, 1))[0])
    il22_adata = adata[:, ["Il22ra2"]].copy()
    il22_adata.obs = pd.concat([il22_adata.obs, covariates], axis=1)
    sc.pp.regress_out(il22_adata, list(covariates.columns))
    il22_sq = float(
        sq.gr.spatial_autocorr(il22_adata, mode="moran", n_perms=None, copy=True)["I"].iloc[0]
    )
    if abs(il22_i_resid - il22_sq) > RESID_ATOL:
        return fail(f"Il22ra2 leftover mismatch {abs(il22_i_resid - il22_sq)}")

    floor = f"{MIN_DETECT:.0%}"
    lines = [
        f"n_cells={adata.n_obs:,}",
        f"min_detect={floor}",
        f"n_scored={int(keep_all.sum())}",
        f"n_scored_within={int(keep_within.sum())}",
        f"n_domains={adata.obs['spatial domain'].nunique()}",
        f"n_enterocytes={enterocytes.n_obs}",
        f"acta2_rank_all={int(acta2['rank_all'])}",
        f"acta2_I_all={acta2['I_all']:.2f}",
        f"acta2_I_resid={acta2['I_resid']:.2f}",
        f"acta2_I_within={acta2['I_within']:.2f}",
        f"apob_I_within={apob['I_within']:.2f}",
        f"apob_rho={apob_rho:.2f}",
        f"apob_low={apob_low:.2f}",
        f"apob_high={apob_high:.2f}",
        f"dhx58_rank_all={int(dhx58['rank_all'])}",
        f"dhx58_rank_resid={int(dhx58['rank_resid'])}",
        f"dhx58_rho={dhx58_rho:.2f}",
        f"nt5e_low={nt5e_low:.2f}",
        f"nt5e_high={nt5e_high:.2f}",
        f"nt5e_rho={nt5e_rho:.2f}",
        f"cps1_low={cps1_low:.2f}",
        f"cps1_high={cps1_high:.2f}",
        f"cps1_rho={cps1_rho:.2f}",
        f"il22ra2_n={il22_n}",
        f"il22ra2_n_enterocytes={il22_ent_n}",
        f"within_only={len(within_only)}:{','.join(within_only)}",
        f"within_rank_moved={len(moved)}",
        f"acta2_rank_within={int(rank_within['Acta2'])}",
        f"acta2_rank_within_on_allcell_genes={int(rank_within_allcell['Acta2'])}",
        f"apob_rank_within={int(rank_within['Apob'])}",
        f"apob_rank_within_on_allcell_genes={int(rank_within_allcell['Apob'])}",
        f"dhx58_rank_within={int(rank_within['Dhx58'])}",
        f"dhx58_rank_within_on_allcell_genes={int(rank_within_allcell['Dhx58'])}",
        f"nt5e_rank_within={int(rank_within['Nt5e'])}",
        f"nt5e_rank_within_on_allcell_genes={int(rank_within_allcell['Nt5e'])}",
        f"cps1_rank_within={int(rank_within['Cps1'])}",
        f"cps1_rank_within_on_allcell_genes={int(rank_within_allcell['Cps1'])}",
        f"il22ra2_I_all={il22_i_all:.2f}",
        f"il22ra2_I_resid={il22_i_resid:.2f}",
        f"n_drop={n_drop}",
        f"TOP_N={TOP_N}",
        f"top_resid_in_topN={top_resid_row['gene']}",
        f"top_resid_in_topN_I={top_resid_row['I_resid']:.2f}",
        f"max_abs_I_all={diff_all:.3e}",
        f"max_abs_I_resid={diff_resid:.3e}",
        f"max_abs_I_within={diff_within:.3e}",
        f"seconds={time.perf_counter() - t0:.1f}",
    ]
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
