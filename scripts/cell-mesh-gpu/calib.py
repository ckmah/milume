"""Label volume vs polygons: mean 3D centroid offset over 300 cells (voxel centre at (i + 0.5) * s + t)."""
import json, numpy as np, shapely, common
from milume.cell_mesh import CellMeshCache, MeshParams
gdf, labels, xy, zs = common.load_polygons()
ref = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, MeshParams(z_step_um=zs))
arr = common.label_array("s0")
S = np.array([0.5, 0.45993900299072266, 0.45993900299072266]); T = np.array([-1.0053027092508273, -5414.147568225861, 784.2817039489746])
rng = np.random.default_rng(2); d = []; ar = []
rows_by = dict(tuple(gdf.groupby("cell_id")))
for c in rng.choice(np.array(ref.cells, dtype=object), 300, replace=False):
    rows = rows_by[c]; a = shapely.area(rows.geometry.values); ct = shapely.centroid(rows.geometry.values)
    pc = np.array([(rows.Z_um.values * a).sum(), (shapely.get_y(ct) * a).sum(), (shapely.get_x(ct) * a).sum()]) / a.sum()
    x0, y0, x1, y1 = ref.bbox[c]
    iy0 = max(int((y0 - T[1]) / S[1]) - 4, 0); iy1 = int((y1 - T[1]) / S[1]) + 5; ix0 = max(int((x0 - T[2]) / S[2]) - 4, 0); ix1 = int((x1 - T[2]) / S[2]) + 5
    v = arr[:, iy0:iy1, ix0:ix1] == ref.label[c]
    zz, yy, xx = np.nonzero(v)
    if not len(zz):
        continue
    lc = np.array([((zz + 0.5) * S[0] + T[0]).mean(), ((yy + iy0 + 0.5) * S[1] + T[1]).mean(), ((xx + ix0 + 0.5) * S[2] + T[2]).mean()])
    d.append(lc - pc); ar.append(v.sum() * S.prod() / (a.sum() * 0.5))
d = np.array(d)
out = {"n": len(d), "mean_offset_zyx_um": d.mean(0).tolist(), "median_offset_zyx_um": np.median(d, 0).tolist(), "std_zyx_um": d.std(0).tolist(), "label_vs_polygon_volume_ratio_median": float(np.median(ar))}
print(json.dumps(out, indent=1)); json.dump(out, open("/workspace/cell-mesh/bench/label-calib.json", "w"), indent=1)
