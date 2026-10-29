#!/usr/bin/env python3
"""Export a clean ileum harness JSON for docs tool captures (no e2e harness chrome).

Writes ``frontend/dev/ileum-docs-base.json`` by default. Does not preload
``harness-point`` / ``lasso-radius`` names; captures start from neutral widget state.
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
DEFAULT_OUT = DEV / "ileum-docs-base.json"

_pyxa_spec = importlib.util.spec_from_file_location(
    "export_pyxa_harness_fixture",
    DEV / "export-pyxa-harness-fixture.py",
)
_pyxa = importlib.util.module_from_spec(_pyxa_spec)
assert _pyxa_spec.loader is not None
_pyxa_spec.loader.exec_module(_pyxa)
FIXTURE_KEYS = _pyxa.FIXTURE_KEYS


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
        default=8000,
        help="Subsample for smaller JSON (0 = all cells)",
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
    widget.mode = "select"
    widget.selections = []
    widget.landmarks = []
    widget.selected_kind = ""
    widget.selected_index = -1
    widget.set_render_mode("points")
    widget.color_mode = "categorical"
    widget.active_genes = []
    widget.raster_similarity_enabled = False
    widget.raster_query_bin = -1
    if widget.raster_embedding_keys:
        widget.raster_embedding_dims = [0, 1, 2]
        if hasattr(widget, "_pack_embedding_values"):
            widget._pack_embedding_values()
        if hasattr(widget, "_pack_embedding_matrix"):
            widget._pack_embedding_matrix()
    widget.raster_basis = "composition"

    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote {args.out} n={adata.n_obs} ({args.out.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
