"""Gene allowlist for the squidpy_moran static docs export (262 KiB prepared manifest).

The marimo-studio export embeds a prepared manifest capped at 256 KiB
(``marimo_export.manifest.MAX_PREPARED_MANIFEST_BYTES``). The full ileum section
(30,332 cells) ships in the landmark ``*.cell.json`` asset; this module lists
every gene whose expression is eager-packed into that asset for the static page.

Edit ``STATIC_PAGE_GENES`` when the recipe prose or Moran tables change.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Final

# Named in prose, Try it, and contrast panels.
_MUST_INCLUDE: Final[tuple[str, ...]] = ("Erbb3", "Apob", "Cps1", "Acta2")

# Top 20 by Moran's I across all cells (ileum_moran_recipe_scores.parquet).
_TOP_ALL_CELLS: Final[tuple[str, ...]] = (
    "Acta2",
    "Apob",
    "Slc5a1",
    "Smtn",
    "Nos2",
    "Cps1",
    "Grem1",
    "Erbb3",
    "Hand2",
    "Cx3cl1",
    "Mki67",
    "Nlrp6",
    "Fgf15",
    "Fzd5",
    "Ptprf",
    "Fn1",
    "Ephb2",
    "Pla2g2a",
    "Mzb1",
    "Il22ra1",
)

# Top 20 by Moran's I inside enterocytes only.
_TOP_ENTEROCYTE: Final[tuple[str, ...]] = (
    "Apob",
    "Slc5a1",
    "Nos2",
    "Ptger4",
    "Cps1",
    "Marcksl1",
    "Nlrp6",
    "Fgf15",
    "Ptprr",
    "Dhx58",
    "Ephb2",
    "Nr1d1",
    "P2ry2",
    "Vegfa",
    "Fzd5",
    "Axin2",
    "Cxcl16",
    "Ptprj",
    "Hoxb9",
    "Itgam",
)

_DEFAULT_SCORES = (
    Path(__file__).resolve().parents[1] / "data" / "ileum_moran_recipe_scores.parquet"
)
_HEADROOM_BYTES: Final = 8_192


def _base_gene_set() -> set[str]:
    return set(_MUST_INCLUDE) | set(_TOP_ALL_CELLS) | set(_TOP_ENTEROCYTE)


def _enterocyte_ranking(scores_csv: Path | None) -> list[str]:
    """Genes ordered by enterocyte Moran's I (high to low), excluding the base set."""
    import pandas as pd

    path = scores_csv or _DEFAULT_SCORES
    if path.suffix == ".csv":
        scores = pd.read_csv(path, index_col=0)
    else:
        scores = pd.read_parquet(path)
    ent = scores["moran_I_enterocyte"].dropna().sort_values(ascending=False)
    base = _base_gene_set()
    return [name for name in ent.index if name not in base]


@lru_cache(maxsize=1)
def build_static_page_genes(
    *,
    scores_path: Path | None = None,
    headroom_bytes: int = _HEADROOM_BYTES,
) -> tuple[str, ...]:
    """Return the shipped gene list, extending the base set while manifest budget allows."""
    from marimo_export.manifest import (
        MAX_PREPARED_MANIFEST_BYTES,
        prepared_manifest_bytes,
    )

    import milume as ml
    import numpy as np

    ileum = Path(__file__).resolve().parents[1] / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum)
    adata.obs["n_counts"] = np.asarray(adata.layers["raw_counts"].sum(axis=1)).ravel()
    adata_map = adata.copy()
    adata_map.obs = adata_map.obs[["cell_type", "n_counts"]].copy()

    genes = sorted(_base_gene_set())
    if not _manifest_fits(adata_map, genes):
        raise RuntimeError(
            "squidpy_moran static page: base gene set does not fit the "
            f"{MAX_PREPARED_MANIFEST_BYTES}-byte prepared manifest with all "
            f"{adata_map.n_obs:,} cells"
        )

    for name in _enterocyte_ranking(scores_path):
        trial = sorted(set(genes) | {name})
        if not _manifest_fits(adata_map, trial):
            break
        if len(prepared_manifest_bytes(_fake_prepared(adata_map, trial))) > (
            MAX_PREPARED_MANIFEST_BYTES - headroom_bytes
        ):
            break
        genes = trial
    return tuple(genes)


def _manifest_fits(adata_map, genes: list[str]) -> bool:
    from marimo_export.manifest import (
        MAX_PREPARED_MANIFEST_BYTES,
        prepared_manifest_bytes,
    )

    try:
        size = len(prepared_manifest_bytes(_fake_prepared(adata_map, genes)))
    except Exception:
        return False
    return size <= MAX_PREPARED_MANIFEST_BYTES


def _fake_prepared(adata_map, genes: list[str]):
    """Minimal prepared manifest matching post-inject slim page data."""
    import milume as ml

    w = ml.peek(adata_map, color="Erbb3", genes=genes)
    state = _slim_widget_state(w, genes)
    return {
        "schema": "marimo-export.prepared.v1",
        "instance": "a" * 64,
        "export_url": "http://example.invalid/export",
        "inputs": {"w": state},
        "state_fingerprint": "b" * 64,
    }


def _slim_widget_state(widget, genes: list[str]) -> dict:
    """Drop asset-heavy fields from synced state (they live in ``*.cell.json``)."""
    state: dict = {}
    for name in widget.trait_names(sync=True):
        if name == "layout":
            continue
        state[name] = getattr(widget, name)
    for key in (
        "_esm",
        "_css",
        "points_data",
        "category_codes",
        "embedding_matrix",
        "embedding_values",
    ):
        if key in state:
            state[key] = "" if not isinstance(state[key], (int, float, bool)) else state[key]
    for key in list(state):
        if key.startswith("gene_csc"):
            state[key] = ""
    state["gene_names"] = [{"name": g} for g in genes]
    return state


STATIC_PAGE_GENES: Final[tuple[str, ...]] = build_static_page_genes()
static_page_gene_count: Final[int] = len(STATIC_PAGE_GENES)
