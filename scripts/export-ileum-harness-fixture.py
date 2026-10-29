#!/usr/bin/env python3
"""Export landmarks harness JSON from the 2D ileum tier (``demos/data/ileum.h5ad``).

Used for docs UI captures and local dev (``?fixture=/ileum-fixture.json``). Adds
``X_pca`` / ``X_umap`` with ``sc.pp.log1p`` only (never ``normalize_total``).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402

DEV = ROOT / "frontend" / "dev"
DEFAULT_OUT = DEV / "ileum-fixture.json"

_pyxa_spec = importlib.util.spec_from_file_location(
    "export_pyxa_harness_fixture",
    DEV / "export-pyxa-harness-fixture.py",
)
_pyxa = importlib.util.module_from_spec(_pyxa_spec)
assert _pyxa_spec.loader is not None
_pyxa_spec.loader.exec_module(_pyxa)
FIXTURE_KEYS = _pyxa.FIXTURE_KEYS
_apply_harness_chrome = _pyxa._apply_harness_chrome


def _prepare_adata(adata):
    import scanpy as sc

    work = adata.copy()
    sc.pp.log1p(work)
    sc.pp.pca(work, n_comps=min(15, work.n_vars - 1, work.n_obs - 1))
    sc.pp.neighbors(work, n_neighbors=15)
    sc.tl.umap(work)
    return work


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--max-cells",
        type=int,
        default=0,
        help="Optional subsample for smaller JSON (0 = all cells)",
    )
    args = parser.parse_args()

    from demos.loaders.demo_tiers import load_2d_ileum_adata

    adata = load_2d_ileum_adata()
    if args.max_cells and adata.n_obs > args.max_cells:
        import scanpy as sc

        sc.pp.subsample(adata, n_obs=args.max_cells, random_state=0)
    adata = _prepare_adata(adata)
    color_key = "cell_type" if "cell_type" in adata.obs.columns else None
    widget = LandmarksWidget(
        adata,
        spatial_key="spatial",
        color=color_key,
        genes=list(adata.var_names),
    )
    widget.legend_title = f"{color_key or 'points'} (Xu 2026 ileum · 2D tier)"
    widget.selected_kind = ""
    widget.selected_index = -1
    widget.raster_similarity_enabled = False
    widget.raster_query_bin = -1

    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS}
    _apply_harness_chrome(widget, payload)
    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS}
    args.out.write_text(json.dumps(payload, separators=(",", ":")))
    print(
        f"wrote {args.out} n={adata.n_obs} "
        f"({args.out.stat().st_size // 1024} KiB)"
    )


if __name__ == "__main__":
    main()
