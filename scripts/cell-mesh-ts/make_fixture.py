"""Dev-harness fixture for client-side meshes: small-leiden.fixture.json with volume.cell_polygons
(parquet + scale + cell_id -> label id) and no labels_url / mesh_url (no label image, no Python meshes)."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "cell-mesh-gpu"))
import common
pub = common.REPO / "frontend/dev/landmarks-volume/public"
gdf, labels, xy, zs = common.load_polygons()
(pub / "small-cell-labels.json").write_text(json.dumps(labels))
link = pub / "small-segmentation.parquet"
if not link.exists():
    os.symlink(common.HF / "segmentation_geometries_v1.parquet", link)
fx = json.loads((pub / "small-leiden.fixture.json").read_text())
vol = dict(fx["volume"]); vol.pop("labels_url", None); vol.pop("mesh_url", None)
vol["cell_polygons"] = {"url": "/small-segmentation.parquet", "xy_um_per_px": xy, "z_um_per_index": zs, "label_ids_url": "/small-cell-labels.json"}
fx["volume"] = vol
(pub / "small-leiden-ts.fixture.json").write_text(json.dumps(fx))
print(vol["cell_polygons"])
