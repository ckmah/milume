#!/usr/bin/env python3
"""Render moran_plots for visual acceptance (same logic as squidpy_moran.moran_plots)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def render(gene: str, out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import milume as ml
    import numpy as np
    import pandas as pd

    ileum = ROOT / "demos" / "data" / "ileum.h5ad"
    cache = ROOT / "demos" / "data" / "ileum_moran_recipe_scores.parquet"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum)
    cached = pd.read_parquet(cache)
    adata.var["moran_I_all"] = cached["moran_I_all"]
    adata.var["moran_I_enterocyte"] = cached["moran_I_enterocyte"]

    top_n_cell_types = 15
    moran_scores = adata.var[["moran_I_all", "moran_I_enterocyte"]]
    both = moran_scores.dropna(subset=["moran_I_all", "moran_I_enterocyte"])
    fig, axes = plt.subplots(
        2,
        1,
        figsize=(8.0, 6.2),
        layout="constrained",
        height_ratios=[3.8, 2.4],
    )
    ax = axes[0]
    ax.scatter(
        both["moran_I_all"],
        both["moran_I_enterocyte"],
        s=8,
        c="0.75",
        linewidths=0,
    )
    lo = float(min(both["moran_I_all"].min(), both["moran_I_enterocyte"].min()))
    hi = float(max(both["moran_I_all"].max(), both["moran_I_enterocyte"].max()))
    ax.plot([lo, hi], [lo, hi], color="0.45", linewidth=0.8)
    if gene in both.index:
        row = both.loc[gene]
        ax.scatter(
            [row["moran_I_all"]],
            [row["moran_I_enterocyte"]],
            s=36,
            c="#d62728",
            zorder=3,
        )
        ax.annotate(
            gene,
            (float(row["moran_I_all"]), float(row["moran_I_enterocyte"])),
            textcoords="offset points",
            xytext=(6, 4),
        )
    elif gene in moran_scores.index and pd.isna(moran_scores.at[gene, "moran_I_enterocyte"]):
        x_all = float(moran_scores.at[gene, "moran_I_all"])
        ax.axvline(x_all, color="#d62728", linewidth=0.8)
        ax.annotate(
            f"{gene}: not expressed in ≥5% of enterocytes",
            (x_all, hi),
            textcoords="offset points",
            xytext=(6, -10),
            fontsize=8,
        )
    ax.set_xlabel("Moran's I, all cells")
    ax.set_ylabel("Moran's I, enterocytes")
    ax.set_title("All cells vs enterocytes")

    ax = axes[1]
    column = adata[:, gene].X
    if hasattr(column, "toarray"):
        values = np.asarray(column.toarray()).ravel()
    else:
        values = np.asarray(column).ravel()
    labels = adata.obs["cell_type"].astype(str).to_numpy()
    means = pd.Series(values).groupby(labels, sort=False).mean()
    top_means = means.nlargest(top_n_cell_types).sort_values(ascending=True)
    ax.barh(top_means.index.astype(str), top_means.to_numpy(), color="0.35")
    ax.tick_params(axis="y", labelsize=7)
    ax.set_xlabel("mean log expression")
    ax.set_title(f"{gene} (top {len(top_means)} cell types by mean expression)")
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_moran_recipe_plot_capture.py GENE OUT.png")
    render(sys.argv[1], Path(sys.argv[2]))
