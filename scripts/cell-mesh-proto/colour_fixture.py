"""Coloured small-dataset fixture for the cell-mesh prototype (branch proto-cell-mesh).

The small Pyxa table has no cell type column, and the stock fixture colours by
ROI (one group) with a selection focused, so every mesh came out grey. This
computes Leiden clusters on the expression table, builds the widget with
``color="leiden"`` and no focus, and writes:

- ``frontend/dev/landmarks-volume/public/small-leiden.fixture.json``: harness fixture
  (load with ``?fixture=/small-leiden.fixture.json``), volume block kept from the
  stock small fixture (``mesh_url`` included).
- ``.../small-leiden.recolor-FOV.json``: the trait deltas Python syncs after
  ``w.color = "FOV"``, so the harness can replay a kernel-side recolour.

Run: .venv/bin/python scripts/cell-mesh-proto/colour_fixture.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "frontend" / "dev"))

import scanpy as sc  # noqa: E402
import spatialdata as sd  # noqa: E402

from milume import LandmarksWidget  # noqa: E402
from milume.volume_source import image_contrast_limits  # noqa: E402

DEV = ROOT / "frontend" / "dev"
PUBLIC = DEV / "landmarks-volume" / "public"
STORE = PUBLIC / "small.sdata.zarr"
STOCK = DEV / "landmarks-volume-fixture.small.json"


def leiden(adata, resolution: float = 1.0) -> None:
    a = adata.copy()
    sc.pp.filter_genes(a, min_cells=3)
    sc.pp.normalize_total(a, target_sum=1e4)
    sc.pp.log1p(a)
    sc.pp.pca(a, n_comps=30)
    sc.pp.neighbors(a, n_neighbors=15)
    sc.tl.leiden(a, resolution=resolution, flavor="igraph", n_iterations=2, random_state=0)
    adata.obs["leiden"] = a.obs["leiden"].astype("category").values


def main() -> None:
    from importlib import import_module

    keys = import_module("export-landmarks-volume-fixture")
    sdata = sd.read_zarr(STORE)
    table = sdata.tables[next(iter(sdata.tables))]
    leiden(table)
    n_clusters = table.obs["leiden"].nunique()
    print("leiden clusters:", n_clusters, flush=True)
    contrast = image_contrast_limits(sdata.images[next(iter(sdata.images))])
    w = LandmarksWidget(sdata, color="leiden", contrast_limits=contrast)
    w.set_render_mode("points")
    stock = json.loads(STOCK.read_text())
    payload = {k: getattr(w, k) for k in keys.FIXTURE_KEYS + keys.VOLUME_KEYS}
    assert payload["points_data"] == stock["points_data"], "cell order differs from the stock fixture"
    payload["volume"] = stock["volume"]  # keeps mesh_url and the harness-relative URLs
    payload["selections"], payload["selected_kind"], payload["selected_index"] = [], "", -1
    out = PUBLIC / "small-leiden.fixture.json"
    out.write_text(json.dumps(payload) + "\n")
    print("wrote", out, f"{out.stat().st_size / 1e6:.1f} MB")

    # Kernel-side recolour: which traits does `w.color = "FOV"` sync?
    before = {k: getattr(w, k) for k in keys.FIXTURE_KEYS}
    cache = getattr(w, "_cell_mesh_cache", None)
    w.color = "FOV"
    after = {k: getattr(w, k) for k in keys.FIXTURE_KEYS}
    delta = {k: v for k, v in after.items() if v != before[k]}
    assert getattr(w, "_cell_mesh_cache", None) is cache, "recolour touched the mesh cache"
    assert "volume" not in delta
    print("w.color='FOV' changes:", sorted(delta))
    (PUBLIC / "small-leiden.recolor-FOV.json").write_text(json.dumps(delta) + "\n")


if __name__ == "__main__":
    main()
