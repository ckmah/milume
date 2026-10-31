"""Data rules for the ileum Moran's I recipe.

The molab notebook inlines these rules. It cannot import this module.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
ILEUM_H5AD = REPO_ROOT / "demos" / "data" / "ileum.h5ad"
MORAN_CACHE = REPO_ROOT / "demos" / "data" / "ileum_moran_recipe_scores.parquet"

MORAN_COLUMNS = ("moran_I_all", "moran_I_enterocyte")
DEFAULT_GENE = "Apob"
ENTEROCYTE_MIN_FRACTION = 0.05


def attach_n_counts(adata) -> None:
    """Set ``obs['n_counts']`` from ``layers['raw_counts']`` when the column is absent."""
    if "n_counts" in adata.obs.columns:
        return
    if "raw_counts" not in adata.layers:
        raise KeyError("n_counts is missing and layers['raw_counts'] is not on this AnnData")
    adata.obs["n_counts"] = np.asarray(adata.layers["raw_counts"].sum(axis=1)).ravel()


def docs_recipe_adata():
    """Ileum slice for the Moran's I docs recipe, with ``n_counts`` attached."""
    import milume as ml

    if ILEUM_H5AD.is_file():
        adata = ml.ds.ileum_merfish_xu2026(path=ILEUM_H5AD)
    else:
        adata = ml.ds.ileum_merfish_xu2026()
    attach_n_counts(adata)
    return adata


def genes_detected_in_at_least(adata, fraction: float) -> list[str]:
    """Names detected in at least ``fraction`` of cells. Detection is ``X > 0``."""
    detected = np.asarray((adata.X > 0).sum(axis=0)).ravel() / adata.n_obs
    return [str(name) for name, keep in zip(adata.var_names, detected >= fraction) if keep]


def read_moran_scores(path: Path) -> pd.DataFrame | None:
    """Return the score table, or None when the file or its columns are absent."""
    if not path.is_file():
        return None
    frame = pd.read_parquet(path)
    if any(col not in frame.columns for col in MORAN_COLUMNS):
        return None
    scores = frame.loc[:, list(MORAN_COLUMNS)].copy()
    scores.index = scores.index.astype(str)
    scores = scores[~scores.index.duplicated(keep="first")]
    return scores


def mean_expression_by_cell_type(adata, gene: str) -> pd.Series:
    """Mean log expression of ``gene`` per ``cell_type``, lowest at the bottom of a barh."""
    column = adata[:, gene].X
    if hasattr(column, "toarray"):
        values = np.asarray(column.toarray()).ravel()
    else:
        values = np.asarray(column).ravel()
    labels = adata.obs["cell_type"].astype(str).to_numpy()
    return pd.Series(values).groupby(labels, sort=False).mean().sort_values(ascending=True)
