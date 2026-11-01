#!/usr/bin/env python3
"""Moran's I recipe rework (#409 / PR #415): Erbb3 (composition) vs Apob (within enterocytes).

Reproduces every number quoted in the reworked recipe and the Scientist report.
Settings match scripts/generate_ileum_moran_recipe_cache.py on the branch:
  X = authors' log-normalized matrix (no normalize_total, no log1p)
  sq.gr.spatial_neighbors_knn(n_neighs=6, percentile=99)
  sq.gr.spatial_autocorr(mode="moran", n_perms=100, rng=0)
  enterocytes = cell_type.str.startswith("Enterocyte"); graph rebuilt on the subset;
  enterocyte run scores genes detected (X > 0) in >= 5% of enterocytes.
Usage: python rerun.py ILEUM_H5AD OUTDIR
"""
import hashlib, json, os, sys
from pathlib import Path

import anndata as ad
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import squidpy as sq
from scipy import sparse
from scipy.spatial import cKDTree
from scipy.stats import spearmanr, mannwhitneyu, kruskal

H5, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
NJ = os.cpu_count()
GENES = ("Erbb3", "Apob")
MARKERS = ("Apob", "Nt5e", "Egfr", "Slc5a1", "Cps1", "Nlrp6", "Mki67", "Erbb3")  # in panel only
S = {}

# ---------- data checks ----------
S["md5"] = hashlib.md5(H5.read_bytes()).hexdigest()
adata = ad.read_h5ad(H5)
X = adata.X
S["shape"] = list(adata.shape)
S["X_max"] = float(X.max())
S["X_is_integer"] = bool(np.allclose(X.data, np.round(X.data)))
S["raw_counts_max"] = int(adata.layers["raw_counts"].max())
adata.obs["n_counts"] = np.asarray(adata.layers["raw_counts"].sum(1)).ravel()
S["median_n_counts"] = float(np.median(adata.obs["n_counts"]))


def col(a, g):
    v = a[:, g].X
    return np.asarray(v.toarray() if sparse.issparse(v) else v).ravel().astype(float)


def moran_manual(a, values):
    """Moran's I with squidpy's default row-normalized weights on a's current graph."""
    W = a.obsp["spatial_connectivities"].tocsr().astype(float)
    rs = np.asarray(W.sum(1)).ravel(); rs[rs == 0] = 1
    W = sparse.diags(1 / rs) @ W
    z = values - values.mean()
    return float(len(z) / W.sum() * (z @ (W @ z)) / (z @ z))


# ---------- Moran's I: all cells and enterocytes (the recipe's calls) ----------
sq.gr.spatial_neighbors_knn(adata, n_neighs=6, percentile=99)
sq.gr.spatial_autocorr(adata, mode="moran", n_perms=100, rng=0, n_jobs=NJ, show_progress_bar=False)
A = adata.uns["moranI"].copy()

ent = adata[adata.obs.cell_type.astype(str).str.startswith("Enterocyte")].copy()
det_ent = np.asarray((ent.X > 0).sum(0)).ravel() / ent.n_obs
det_all = np.asarray((adata.X > 0).sum(0)).ravel() / adata.n_obs
genes = list(ent.var_names[det_ent >= 0.05])
sq.gr.spatial_neighbors_knn(ent, n_neighs=6, percentile=99)
sq.gr.spatial_autocorr(ent, genes=genes, mode="moran", n_perms=100, rng=0, n_jobs=NJ, show_progress_bar=False)
E = ent.uns["moranI"].copy()

tab = pd.DataFrame(index=adata.var_names)
tab["moran_I_all"] = A["I"]; tab["pval_sim_all"] = A["pval_sim"]; tab["fdr_sim_all"] = A["pval_sim_fdr_bh"]
tab["moran_I_enterocyte"] = E["I"]; tab["pval_sim_ent"] = E["pval_sim"]; tab["fdr_sim_ent"] = E["pval_sim_fdr_bh"]
tab["frac_expr_all"] = det_all; tab["frac_expr_ent"] = det_ent
tab["rank_all"] = tab.moran_I_all.rank(ascending=False)
tab["rank_ent"] = tab.moran_I_enterocyte.rank(ascending=False)
S["n_enterocytes"] = int(ent.n_obs); S["n_ent_genes"] = len(genes)
S["enterocyte_subtypes"] = ent.obs.cell_type.value_counts().loc[lambda s: s > 0].to_dict()
t20a = tab.moran_I_all.nlargest(20).index; t20e = tab.moran_I_enterocyte.nlargest(20).index
S["top20_overlap"] = [g for g in t20a if g in set(t20e)]

# manual Moran agrees with squidpy (needed for residual tests below)
S["manual_check_Apob_ent"] = [moran_manual(ent, col(ent, "Apob")), float(tab.at["Apob", "moran_I_enterocyte"])]

# ---------- composition test (all cells): remove cell-type means, re-score ----------
ct = adata.obs.cell_type.astype(str).to_numpy()
cls = adata.obs.cell_class.astype(str).to_numpy()
for g in GENES + ("Acta2",):
    v = col(adata, g)
    m = pd.Series(v).groupby(ct).transform("mean").to_numpy()
    eta2 = 1 - ((v - m) ** 2).sum() / ((v - v.mean()) ** 2).sum()
    S.setdefault("composition", {})[g] = {
        "I_all": float(tab.at[g, "moran_I_all"]),
        "I_all_celltype_mean_only": moran_manual(adata, m),
        "I_all_after_removing_celltype_means": moran_manual(adata, v - m),
        "eta2_cell_type": float(eta2),
        "mean_by_class": pd.Series(v).groupby(cls).mean().round(3).to_dict(),
        "frac_by_class": pd.Series(v > 0).groupby(cls).mean().round(3).to_dict(),
    }

# ---------- within enterocytes: villus axis ----------
eo = ent.obs
ps_raw = eo["mucosal_pseudospace"].to_numpy()
ok = ps_raw >= 0  # -1 = outside the mucosa (a few enterocytes sit in GALT/submucosa); excluded from axis stats
S["n_ent_outside_mucosa"] = int((~ok).sum())
ps = np.where(ok, ps_raw, np.nan)
# independent geometric axis: distance (um) to nearest crypt-base cell (Stem or Paneth)
crypt = adata.obs.cell_type.astype(str).isin(["Stem", "Paneth"]).to_numpy()
dist_crypt, _ = cKDTree(adata.obsm["spatial"][crypt]).query(ent.obsm["spatial"])
eo["dist_to_crypt_um"] = dist_crypt
S["n_crypt_cells"] = int(crypt.sum())
S["rho_pseudospace_vs_dist_crypt"] = float(spearmanr(ps[ok], dist_crypt[ok]).statistic)

nc = eo["n_counts"].to_numpy().astype(float)
def partial_spearman(x, y, z):
    from scipy.stats import rankdata
    rx, ry, rz = (rankdata(t[ok]) for t in (x, y, z))
    res = lambda a, b: a - np.polyval(np.polyfit(b, a, 1), b)
    return float(np.corrcoef(res(rx, rz), res(ry, rz))[0, 1])

bins = np.full(len(ps), -1); bins[ok] = pd.qcut(ps[ok], 10, labels=False)
axis = {}
binned = {}
for g in MARKERS:
    v = col(ent, g)
    axis[g] = {
        "rho_pseudospace": float(spearmanr(v[ok], ps[ok]).statistic),
        "rho_dist_to_crypt": float(spearmanr(v[ok], dist_crypt[ok]).statistic),
        "partial_rho_pseudospace_given_n_counts": partial_spearman(v, ps, nc),
        "frac_expr_ent": float((v > 0).mean()),
    }
    binned[g] = pd.Series(v[ok]).groupby(bins[ok]).mean().to_numpy()
S["rho_n_counts_pseudospace"] = float(spearmanr(nc[ok], ps[ok]).statistic)
# is the depth gradient just Apob itself? depth without Apob counts
apob_raw = np.asarray(ent.layers["raw_counts"][:, ent.var_names.get_loc("Apob")].toarray()).ravel()
S["rho_n_counts_minus_Apob_pseudospace"] = float(spearmanr((nc - apob_raw)[ok], ps[ok]).statistic)
S["Apob_share_of_counts_top_decile"] = None  # filled below
nt = col(ent, "Nt5e"); eg = col(ent, "Egfr")
binned["n_counts"] = pd.Series(nc[ok]).groupby(bins[ok]).mean().to_numpy()
pd.DataFrame(binned).assign(pseudospace_mid=pd.Series(ps[ok]).groupby(bins[ok]).median().to_numpy()).to_csv(OUT / "binned_by_pseudospace_decile.csv")

# Apob effect size: villus base vs villus tip (bottom vs top pseudospace decile, and subtype labels)
ap = col(ent, "Apob")
lo, hi = bins == 0, bins == 9
u = mannwhitneyu(ap[hi], ap[lo])
S["Apob_base_vs_tip"] = {
    "mean_bottom_decile": float(ap[lo].mean()), "mean_top_decile": float(ap[hi].mean()),
    "frac_expr_bottom_decile": float((ap[lo] > 0).mean()), "frac_expr_top_decile": float((ap[hi] > 0).mean()),
    "fold_raw_counts_top_vs_bottom": float(
        np.asarray(ent.layers["raw_counts"][:, ent.var_names.get_loc("Apob")].toarray()).ravel()[hi].mean()
        / np.asarray(ent.layers["raw_counts"][:, ent.var_names.get_loc("Apob")].toarray()).ravel()[lo].mean()),
    "cliffs_delta_top_vs_bottom": float(2 * u.statistic / (hi.sum() * lo.sum()) - 1),
    "mannwhitney_p": float(u.pvalue),
}
S["Apob_share_of_counts_top_decile"] = float(apob_raw[hi].sum() / nc[hi].sum())
S["Apob_share_of_counts_bottom_decile"] = float(apob_raw[lo].sum() / nc[lo].sum())
S["tip_markers_frac_expr"] = {"Nt5e": [float((nt[lo] > 0).mean()), float((nt[hi] > 0).mean())],
                              "Egfr": [float((eg[lo] > 0).mean()), float((eg[hi] > 0).mean())]}  # [bottom decile, top decile]
sub = eo.cell_type.astype(str)
S["Apob_by_subtype"] = {k: {"n": int((sub == k).sum()), "mean": float(ap[sub == k].mean()),
                            "frac_expr": float((ap[sub == k] > 0).mean()),
                            "median_pseudospace": float(np.nanmedian(ps[sub == k]))}
                        for k in ["Enterocyte (bottom)", "Enterocyte (mid)", "Enterocyte (top)", "Enterocyte (Scnn1g+)"]}
S["Apob_kruskal_subtypes_p"] = float(kruskal(*[ap[sub == k] for k in ["Enterocyte (bottom)", "Enterocyte (mid)", "Enterocyte (top)"]]).pvalue)

# How much of the within-enterocyte I does the villus axis explain? Remove a 20-bin pseudospace trend, re-score.
b20 = np.full(len(ps), -1); b20[ok] = pd.qcut(ps[ok], 20, labels=False)
resid = {}
for g in GENES + ("Nt5e", "Slc5a1", "Cps1"):
    v = col(ent, g)
    trend = pd.Series(v).groupby(b20).transform("mean").to_numpy()
    resid[g] = {"I_ent": moran_manual(ent, v), "I_ent_after_removing_villus_trend": moran_manual(ent, v - trend),
                "I_ent_villus_trend_only": moran_manual(ent, trend)}
resid["n_counts"] = {"I_ent": moran_manual(ent, nc)}
S["villus_trend_residual"] = resid

# stricter check: single subtype (Enterocyte (mid)), graph rebuilt again
mid = ent[ent.obs.cell_type.astype(str) == "Enterocyte (mid)"].copy()
sq.gr.spatial_neighbors_knn(mid, n_neighs=6, percentile=99)
sq.gr.spatial_autocorr(mid, genes=list(GENES), mode="moran", n_perms=100, rng=0, n_jobs=NJ, show_progress_bar=False)
S["single_subtype_mid"] = {"n": int(mid.n_obs), **{g: float(mid.uns["moranI"].at[g, "I"]) for g in GENES}}

# Gene summaries
for g in GENES:
    r = tab.loc[g]
    S[g] = {k: float(r[k]) for k in ["moran_I_all", "moran_I_enterocyte", "pval_sim_all", "fdr_sim_all", "pval_sim_ent",
                                       "fdr_sim_ent", "frac_expr_all", "frac_expr_ent", "rank_all", "rank_ent"]}
    S[g]["drop_all_minus_ent"] = float(r.moran_I_all - r.moran_I_enterocyte)
S["axis"] = axis

# alternatives: within-enterocyte genes ranked by I_ent with their villus rho
alt = tab.dropna(subset=["moran_I_enterocyte"]).copy()
alt["rho_pseudospace_ent"] = [spearmanr(col(ent, g)[ok], ps[ok]).statistic for g in alt.index]
alt.sort_values("moran_I_enterocyte", ascending=False).to_csv(OUT / "within_enterocyte_genes.csv")
tab.to_csv(OUT / "moran_table.csv")

# cache columns proposed for the branch parquet (var-level)
tab[["moran_I_all", "moran_I_enterocyte"]].to_parquet(OUT / "proposed_var_cache.parquet")

# ---------- figures ----------
xy = adata.obsm["spatial"]
muc = adata.obs.anatomical_layer.astype(str).eq("Mucosa").to_numpy()
xm = float(np.median(xy[muc, 0]))
win = (xy[:, 0] >= xm - 200) & (xy[:, 0] <= xm + 200)
S["window_x_um"] = [xm - 200, xm + 200]
y0 = float(xy[win, 1].min())
crop = win & (xy[:, 1] <= y0 + 650)  # figure crop: lower wall of the strip, a handful of villi
S["fig2_crop_y_um"] = [y0, y0 + 650]

# Fig 1: Erbb3 composition
fig, ax = plt.subplots(1, 3, figsize=(15, 5.2), layout="constrained")
v = col(adata, "Erbb3")
o = np.argsort(v)
ax[0].scatter(xy[o, 0], xy[o, 1], c=v[o], s=1.2, cmap="Reds", vmin=0, vmax=np.percentile(v[v > 0], 99), linewidths=0, rasterized=True)
ax[0].set_aspect("equal"); ax[0].set_title("Erbb3 across all cells (log-normalized X)"); ax[0].set_xticks([]); ax[0].set_yticks([])
mb = pd.Series(S["composition"]["Erbb3"]["mean_by_class"]).sort_values()
ax[1].barh(mb.index, mb.values, color="0.35"); ax[1].set_xlabel("mean log expression"); ax[1].set_title("Erbb3 by cell class")
c = S["composition"]
labs = ["all cells", "enterocytes only", "Enterocyte (mid) only"]
w_ = 0.38
for i, (g, colr) in enumerate([("Erbb3", "#1f77b4"), ("Apob", "#d62728")]):
    vals = [S[g]["moran_I_all"], S[g]["moran_I_enterocyte"], S["single_subtype_mid"][g]]
    ax[2].bar(np.arange(3) + (i - 0.5) * w_, vals, w_, label=g, color=colr)
    for j, val in enumerate(vals):
        ax[2].text(j + (i - 0.5) * w_, val + 0.01, f"{val:.2f}", ha="center", fontsize=9)
ax[2].set_xticks(range(3), labs); ax[2].set_ylabel("Moran's I"); ax[2].legend(); ax[2].set_title("Fix the cell type: Erbb3 collapses, Apob stays")
fig.savefig(OUT / "fig1_erbb3_composition.png", dpi=130); plt.close(fig)

# Fig 2: Apob along the villus axis
fig = plt.figure(figsize=(15, 10), layout="constrained")
gs = fig.add_gridspec(2, 3, height_ratios=[1.1, 1])
ew = crop[adata.obs.cell_type.astype(str).str.startswith("Enterocyte").to_numpy()]
exy = ent.obsm["spatial"]
for k, (vals, title, cmap) in enumerate([(ap, "Apob in enterocytes (villus tips point up)", "Reds"),
                                          (ps_raw, "mucosal_pseudospace (authors' villus axis)", "viridis"),
                                          (col(ent, "Erbb3"), "Erbb3 in enterocytes", "Reds")]):
    # gray = all other cells; lumen/villus tips point up in this crop
    a_ = fig.add_subplot(gs[0, k])
    a_.scatter(xy[crop, 0], xy[crop, 1], c="0.88", s=4, linewidths=0, rasterized=True)
    oo = np.argsort(vals[ew])
    a_.scatter(exy[ew][oo, 0], exy[ew][oo, 1], c=vals[ew][oo], s=9, cmap=cmap, vmin=np.percentile(vals[ew], 2), vmax=np.percentile(vals[ew], 98), linewidths=0, rasterized=True)
    a_.set_aspect("equal"); a_.set_title(title); a_.set_xticks([]); a_.set_yticks([])
a_ = fig.add_subplot(gs[1, :2])
bd = pd.read_csv(OUT / "binned_by_pseudospace_decile.csv")
for g, colr in [("Apob", "#d62728"), ("Nt5e", "#9467bd"), ("Egfr", "#8c564b"), ("Slc5a1", "#ff7f0e"),
                ("Cps1", "#2ca02c"), ("Erbb3", "#1f77b4"), ("n_counts", "0.5")]:
    y = bd[g] / bd[g].max()
    a_.plot(np.arange(1, 11), y, "-o", color=colr, label=f"{g} (rho {axis[g]['rho_pseudospace']:+.2f})" if g in axis else "n_counts (depth)",
            ls="--" if g == "n_counts" else "-")
a_.set_xlabel("villus-axis decile within enterocytes (1 = villus base, 10 = villus tip)")
a_.set_ylabel("mean expression / max over deciles"); a_.legend(fontsize=8, ncol=2); a_.set_title("Within enterocytes, Apob rises toward the villus tip")
a_ = fig.add_subplot(gs[1, 2])
order = ["Enterocyte (bottom)", "Enterocyte (mid)", "Enterocyte (top)"]
a_.boxplot([ap[sub == k] for k in order], showfliers=False)
a_.set_xticks([1, 2, 3], ["bottom", "mid", "top"]); a_.set_ylabel("Apob (log-normalized)"); a_.set_title("Apob by authors' enterocyte subtype")
fig.savefig(OUT / "fig2_apob_villus_axis.png", dpi=130); plt.close(fig)

# Fig 3: I scatter with both genes
both = tab.dropna(subset=["moran_I_all", "moran_I_enterocyte"])
fig, a_ = plt.subplots(figsize=(6, 5.5), layout="constrained")
a_.scatter(both.moran_I_all, both.moran_I_enterocyte, s=10, c="0.75", linewidths=0)
mx = float(both[["moran_I_all", "moran_I_enterocyte"]].max().max())
a_.plot([0, mx], [0, mx], color="0.5", lw=0.8)
for g, colr in [("Erbb3", "#1f77b4"), ("Apob", "#d62728")]:
    a_.scatter(both.at[g, "moran_I_all"], both.at[g, "moran_I_enterocyte"], s=50, c=colr, zorder=3)
    a_.annotate(g, (both.at[g, "moran_I_all"], both.at[g, "moran_I_enterocyte"]), xytext=(6, 4), textcoords="offset points")
a_.set_xlabel("Moran's I, all cells"); a_.set_ylabel("Moran's I, enterocytes only"); a_.set_title("Erbb3 falls off the diagonal; Apob stays near it")
fig.savefig(OUT / "fig3_moran_scatter.png", dpi=130); plt.close(fig)

json.dump(S, open(OUT / "summary.json", "w"), indent=1, default=str)
print(json.dumps(S, indent=1, default=str))
