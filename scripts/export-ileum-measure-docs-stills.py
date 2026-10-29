#!/usr/bin/env python3
"""Regenerate measure docs PNGs on the ileum 2D tier (``demos/data:ileum``).

Writes under ``website/content/assets/tools/measure/``. Optionally composites
``hero.{dark,light}.png`` when ``MEASURE_WIDGET_PNG`` points at a harness screenshot
of the widget pane (left side of the hero still).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "website" / "content" / "assets" / "tools" / "measure"

DARK = {
    "fig": "#0f172a",
    "text": "#e2e8f0",
    "grid": "#334155",
    "bar": "#38bdf8",
    "pos": "#f59e0b",
    "neg": "#14b8a6",
}
LIGHT = {
    "fig": "#f8fafc",
    "text": "#0f172a",
    "grid": "#cbd5e1",
    "bar": "#0284c7",
    "pos": "#d97706",
    "neg": "#0d9488",
}


def _milume_sha() -> str:
    r = subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return r.stdout.strip()


def _landmarks_gdf(adata):
    from milume import LandmarksWidget, landmarks_to_geodataframe

    import scanpy as sc

    work = adata.copy()
    sc.pp.log1p(work)
    sc.pp.pca(work, n_comps=min(15, work.n_vars - 1, work.n_obs - 1))
    sc.pp.neighbors(work, n_neighbors=15)
    sc.tl.umap(work)
    w = LandmarksWidget(work, spatial_key="spatial", color="cell_type")
    xs = adata.obsm["spatial"][:, 0]
    ys = adata.obsm["spatial"][:, 1]
    cx, cy = float(np.median(xs)), float(np.median(ys))
    span = float(max(xs.max() - xs.min(), ys.max() - ys.min()))
    w.landmarks = [
        {
            "id": "villus-axis",
            "type": "spline",
            "vertices": [
                [cx - span * 0.18, cy - span * 0.08],
                [cx, cy + span * 0.06],
                [cx + span * 0.2, cy - span * 0.04],
            ],
            "tension": 0.35,
            "buffer_width": span * 0.07,
            "buffer_side": "both",
            "line_style": "solid",
            "color": "#00e5ff",
        }
    ]
    w.selections = [
        {
            "id": "crypt-focus",
            "type": "polygon",
            "vertices": [
                [cx - span * 0.14, cy - span * 0.14],
                [cx + span * 0.08, cy - span * 0.14],
                [cx + span * 0.08, cy + span * 0.1],
                [cx - span * 0.14, cy + span * 0.1],
            ],
            "neighborhood": "none",
        }
    ]
    return w, landmarks_to_geodataframe(w.landmarks)


def _style(theme: dict):
    plt.rcParams.update(
        {
            "figure.facecolor": theme["fig"],
            "axes.facecolor": theme["fig"],
            "axes.edgecolor": theme["grid"],
            "axes.labelcolor": theme["text"],
            "xtick.color": theme["text"],
            "ytick.color": theme["text"],
            "text.color": theme["text"],
            "grid.color": theme["grid"],
        }
    )


def _save_distances(path: Path, theme: dict, df: pd.DataFrame) -> None:
    _style(theme)
    fig, ax = plt.subplots(figsize=(5.2, 4.2), dpi=160)
    ax.hist(df["distance"], bins=32, color=theme["bar"], edgecolor="none")
    ax.set_xlabel("Distance to landmark")
    ax.set_ylabel("Cell count")
    ax.grid(True, alpha=0.35)
    fig.tight_layout()
    fig.savefig(path, facecolor=theme["fig"])
    plt.close(fig)


def _composition_bar_counts(df: pd.DataFrame, *, top_n: int = 15) -> pd.Series:
    """Top groups by count; fold the rest into Other so y labels stay readable."""
    totals = df.groupby("group")["count"].sum().sort_values(ascending=False)
    if len(totals) <= top_n:
        return totals.sort_values(ascending=True)
    head = totals.iloc[:top_n]
    other = totals.iloc[top_n:].sum()
    merged = pd.concat([head, pd.Series({"Other": other})])
    return merged.sort_values(ascending=True)


def _save_composition(path: Path, theme: dict, df: pd.DataFrame) -> None:
    _style(theme)
    counts = _composition_bar_counts(df)
    fig, ax = plt.subplots(figsize=(5.2, 4.2), dpi=160)
    ax.barh(counts.index.astype(str), counts.values, color=theme["bar"])
    ax.set_xlabel("Cell count")
    ax.grid(True, axis="x", alpha=0.35)
    fig.tight_layout()
    fig.savefig(path, facecolor=theme["fig"])
    plt.close(fig)


def _save_along(path: Path, theme: dict, df: pd.DataFrame) -> None:
    _style(theme)
    fig, ax = plt.subplots(figsize=(5.2, 4.2), dpi=160)
    ax.hist(df["s"], bins=32, color=theme["bar"], edgecolor="none")
    ax.set_xlabel("Position along landmark")
    ax.set_ylabel("Cell count")
    ax.grid(True, alpha=0.35)
    fig.tight_layout()
    fig.savefig(path, facecolor=theme["fig"])
    plt.close(fig)


def _save_enrichment(path: Path, theme: dict, df: pd.DataFrame) -> None:
    _style(theme)
    agg = df.groupby("group")["log2_enrichment"].mean().sort_values()
    colors = [theme["pos"] if v >= 0 else theme["neg"] for v in agg.values]
    fig, ax = plt.subplots(figsize=(5.2, 4.2), dpi=160)
    ax.barh(agg.index.astype(str), agg.values, color=colors)
    ax.axvline(0, color=theme["grid"], linewidth=1)
    ax.set_xlabel("log2 enrichment")
    ax.grid(True, axis="x", alpha=0.35)
    fig.tight_layout()
    fig.savefig(path, facecolor=theme["fig"])
    plt.close(fig)


def _save_nearest(path: Path, theme: dict, df: pd.DataFrame) -> None:
    _style(theme)
    col = "distance_xy" if "distance_xy" in df.columns else "distance"
    fig, ax = plt.subplots(figsize=(5.2, 4.2), dpi=160)
    ax.hist(df[col], bins=32, color=theme["bar"], edgecolor="none")
    ax.set_xlabel("Distance to nearest selected cell")
    ax.set_ylabel("Cell count")
    ax.grid(True, alpha=0.35)
    fig.tight_layout()
    fig.savefig(path, facecolor=theme["fig"])
    plt.close(fig)


def _composite_hero(widget_png: Path, hist_png: Path, out: Path) -> None:
    from PIL import Image

    left = Image.open(widget_png).convert("RGBA")
    right = Image.open(hist_png).convert("RGBA")
    h = max(left.height, right.height)
    scale_l = h / left.height
    scale_r = h / right.height
    left = left.resize((int(left.width * scale_l), h))
    right = right.resize((int(right.width * scale_r), h))
    canvas = Image.new("RGBA", (left.width + right.width + 24, h), (0, 0, 0, 0))
    canvas.paste(left, (0, 0))
    canvas.paste(right, (left.width + 24, 0))
    canvas.convert("RGB").save(out)


def main() -> None:
    from demos.loaders.demo_tiers import load_2d_ileum_adata
    from milume import (
        along_positions,
        composition,
        distances,
        enrichment,
        nearest_distances,
    )

    adata = load_2d_ileum_adata()
    if adata.n_obs > 8000:
        import scanpy as sc

        sc.pp.subsample(adata, n_obs=8000, random_state=0)
    if adata.obsm["spatial"].shape[1] == 2:
        z = np.zeros((adata.n_obs, 1), dtype=np.float64)
        adata.obsm["spatial"] = np.hstack([adata.obsm["spatial"], z])
    widget, gdf = _landmarks_gdf(adata)
    sel_ids = list(widget.get_obs_names("crypt-focus"))

    d = distances(adata, gdf, obs_key="cell_type")
    c = composition(adata, gdf, obs_key="cell_type")
    a = along_positions(adata, gdf, obs_key="cell_type")
    e = enrichment(adata, sel_ids, obs_key="cell_type")
    n = nearest_distances(adata, sel_ids, obs_key="cell_type")

    sha = _milume_sha()
    sidecar = {"dataset": "demos/data:ileum", "seed": 0, "milume": sha}
    OUT.mkdir(parents=True, exist_ok=True)

    widget_png = os.environ.get("MEASURE_WIDGET_PNG")
    for theme_name, theme in (("dark", DARK), ("light", LIGHT)):
        _save_distances(OUT / f"plot-distances.{theme_name}.png", theme, d)
        _save_composition(OUT / f"plot-composition.{theme_name}.png", theme, c)
        _save_along(OUT / f"plot-along_positions.{theme_name}.png", theme, a)
        _save_enrichment(OUT / f"plot-enrichment.{theme_name}.png", theme, e)
        _save_nearest(OUT / f"plot-nearest_distances.{theme_name}.png", theme, n)
        if widget_png and Path(widget_png).is_file():
            _composite_hero(
                Path(widget_png),
                OUT / f"plot-distances.{theme_name}.png",
                OUT / f"hero.{theme_name}.png",
            )

    for stem in (
        "hero",
        "plot-distances",
        "plot-composition",
        "plot-along_positions",
        "plot-enrichment",
        "plot-nearest_distances",
    ):
        (OUT / f"{stem}.json").write_text(json.dumps(sidecar) + "\n")
    print(f"wrote measure stills under {OUT}")


if __name__ == "__main__":
    main()
