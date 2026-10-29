#!/usr/bin/env python3
"""Small ileum harness JSON for GALT lasso composition e2e (committed under frontend/dev/)."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402

DEV = ROOT / "frontend" / "dev"
OUT = DEV / "e2e-galt-lasso-fixture.json"

_pyxa_spec = importlib.util.spec_from_file_location(
    "export_pyxa_harness_fixture",
    DEV / "export-pyxa-harness-fixture.py",
)
_pyxa = importlib.util.module_from_spec(_pyxa_spec)
assert _pyxa_spec.loader is not None
_pyxa_spec.loader.exec_module(_pyxa)
FIXTURE_KEYS = _pyxa.FIXTURE_KEYS


def main() -> None:
    import numpy as np
    import scanpy as sc

    from demos.loaders.demo_tiers import load_2d_ileum_adata

    adata = load_2d_ileum_adata()
    layer = adata.obs.get("anatomical_layer")
    if layer is None:
        raise SystemExit("ileum adata missing anatomical_layer")
    galt = np.asarray(layer == "GALT").ravel()
    keep = np.where(galt)[0]
    if keep.size < 20:
        raise SystemExit(f"too few GALT cells: {keep.size}")
    rest = np.where(~galt)[0]
    rng = np.random.default_rng(0)
    rest_take = rng.choice(rest, size=min(1200, rest.size), replace=False)
    ix = np.sort(np.concatenate([keep, rest_take]))
    adata = adata[ix].copy()

    sc.pp.log1p(adata)
    sc.pp.pca(adata, n_comps=min(15, adata.n_vars - 1, adata.n_obs - 1))
    sc.pp.neighbors(adata, n_neighbors=15)
    sc.tl.umap(adata)

    widget = LandmarksWidget(
        adata,
        spatial_key="spatial",
        color="cell_type",
        genes=list(adata.var_names[:20]),
    )
    widget.mode = "select"
    widget.selections = []
    widget.landmarks = []
    widget.selected_kind = ""
    widget.selected_index = -1
    widget.set_render_mode("points")
    widget.color_mode = "categorical"
    widget.active_genes = []

    payload = {key: getattr(widget, key) for key in FIXTURE_KEYS}
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote {OUT} n={adata.n_obs} ({OUT.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
