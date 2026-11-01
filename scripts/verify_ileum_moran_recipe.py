#!/usr/bin/env python3
"""Moran's I recipe (#409 / PR #415): Erbb3 (layout) vs Apob (within enterocytes), v5.

Reproduces every number in the recipe prose, with the recipe's own calls:
  X = authors' log-normalized matrix (no normalize_total, no log1p)
  sq.gr.spatial_neighbors_knn(n_neighs=6, percentile=99)
  sq.gr.spatial_autocorr(mode="moran", n_perms=None)        # I only, no shuffle test
  enterocytes = cell_type.str.startswith("Enterocyte"); graph rebuilt on the subset;
  enterocyte run scores genes detected (X > 0) in >= 5% of enterocytes.
Villus axis: each enterocyte's straight-line distance (um) to the nearest Stem or Paneth cell.
No mucosal_pseudospace anywhere.
Usage: python scripts/verify_ileum_moran_recipe.py ILEUM_H5AD OUTDIR
"""
import hashlib
import json
import sys
from pathlib import Path

import anndata as ad
import numpy as np
import pandas as pd
import squidpy as sq
from scipy.spatial import KDTree

H5, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
S = {"md5": hashlib.md5(H5.read_bytes()).hexdigest(), "squidpy": sq.__version__}

adata = ad.read_h5ad(H5)
adata.obs["n_counts"] = np.asarray(adata.layers["raw_counts"].sum(axis=1)).ravel()
S["shape"] = list(adata.shape)
S["X_max"] = round(float(adata.X.max()), 1)

# Moran's I, all cells
sq.gr.spatial_neighbors_knn(adata, n_neighs=6, percentile=99)
moran_all = sq.gr.spatial_autocorr(adata, mode="moran", n_perms=None, copy=True)

# Moran's I, enterocytes only
ent = adata[adata.obs.cell_type.str.startswith("Enterocyte")].copy()
detected = np.asarray((ent.X > 0).sum(axis=0)).ravel() / ent.n_obs
genes = list(ent.var_names[detected >= 0.05])
sq.gr.spatial_neighbors_knn(ent, n_neighs=6, percentile=99)
moran_ent = sq.gr.spatial_autocorr(ent, genes=genes, mode="moran", n_perms=None, copy=True)
scores = pd.DataFrame({"moran_I_all": moran_all["I"], "moran_I_enterocyte": moran_ent["I"]})
S["n_enterocytes"], S["n_ent_genes"] = int(ent.n_obs), len(genes)
for g in ("Erbb3", "Apob"):
    S[g] = {k: round(float(scores.at[g, k]), 4) for k in scores.columns}
S["Erbb3"]["frac_expr_ent"] = round(float((ent[:, "Erbb3"].X > 0).mean()), 3)
S["top20_overlap"] = len(
    scores.moran_I_all.nlargest(20).index.intersection(scores.moran_I_enterocyte.nlargest(20).index)
)

# Villus axis: distance to the nearest Stem or Paneth cell
crypt = adata.obs["cell_type"].isin(["Stem", "Paneth"]).to_numpy()
dist, _ = KDTree(adata.obsm["spatial"][crypt]).query(ent.obsm["spatial"])
dist = pd.Series(dist, index=ent.obs_names)
S["n_crypt_cells"] = int(crypt.sum())
S["dist_um_quantiles_0_10_50_90_100"] = np.quantile(dist, [0, 0.1, 0.5, 0.9, 1]).round(1).tolist()
expr = {g: ent[:, g].to_df()[g] for g in ("Erbb3", "Apob", "Cps1")}
S["rho_dist"] = {g: round(float(v.corr(dist, method="spearman")), 3) for g, v in expr.items()}
tenth = pd.qcut(dist, 10, labels=False)
S["frac_expr_nearest_vs_farthest_tenth"] = {
    g: [
        round(float((v[tenth == 0] > 0).mean()), 4),
        round(float((v[tenth == 9] > 0).mean()), 4),
    ]
    for g, v in expr.items()
}

# Depth check: Spearman rho(n_counts, dist) and partial rho(Apob, dist | n_counts)
ranks = pd.DataFrame({"apob": expr["Apob"], "dist": dist, "depth": ent.obs["n_counts"]}).rank()


def remove_depth(col):
    return ranks[col] - np.polyval(np.polyfit(ranks["depth"], ranks[col], 1), ranks["depth"])


S["rho_n_counts_dist"] = round(float(ranks["depth"].corr(ranks["dist"])), 3)
S["partial_rho_apob_dist_given_n_counts"] = round(
    float(np.corrcoef(remove_depth("apob"), remove_depth("dist"))[0, 1]), 3
)

profile = pd.DataFrame(expr).assign(n_counts=ent.obs["n_counts"]).groupby(tenth.to_numpy()).mean()
profile.to_csv(OUT / "profile_by_distance_tenth.csv")
scores.to_csv(OUT / "moran_scores.csv")
(OUT / "summary.json").write_text(json.dumps(S, indent=2))
print(json.dumps(S, indent=2))
