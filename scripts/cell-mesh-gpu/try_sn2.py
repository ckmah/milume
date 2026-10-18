import time, numpy as np, common
from milume.cell_mesh import CellMeshCache, MeshParams
from surface_nets import surface_nets, packed_bytes
from surface_nets_nb import surface_nets_nb
gdf, labels, xy, zs = common.load_polygons()
cache = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, MeshParams(z_step_um=zs))
import json
g = common.label_array("s0")
for lvl in ("s1", "s0"):
    arr = common.label_array(lvl)
    S = np.array([0.5, 0.45993900299072266, 0.45993900299072266]) * np.array(g.shape) / np.array(arr.shape)
    T = np.array([-1.0053027092508273, -5414.147568225861, 784.2817039489746])
    for win in (100, 300):
        cells = cache.cells_in(*common.window_box(win))
        bb = np.array([cache.bbox[c] for c in cells]); x0, y0 = bb[:, :2].min(0); x1, y1 = bb[:, 2:].max(0)
        ix0 = max(int((x0 - T[2]) / S[2]) - 1, 0); ix1 = int((x1 - T[2]) / S[2]) + 2
        iy0 = max(int((y0 - T[1]) / S[1]) - 1, 0); iy1 = int((y1 - T[1]) / S[1]) + 2
        vol = arr[:, iy0:iy1, ix0:ix1]
        keep = [cache.label[c] for c in cells]
        for rep in range(2):
            tm = {}
            t = time.perf_counter(); m = surface_nets_nb(vol, S, T + S * np.array([0, iy0, ix0]), keep, timings=tm); dt = time.perf_counter() - t
        print(lvl, win, vol.shape, f"{dt:.2f}s", {k: round(v, 3) for k, v in tm.items()}, "tris", m.n_triangles, "bytes", packed_bytes(m), flush=True)
        if lvl == "s1" and win == 100:
            t = time.perf_counter(); m2 = surface_nets(vol, S, T + S * np.array([0, iy0, ix0]), keep_labels=keep); print("numpy ref", f"{time.perf_counter()-t:.2f}s", m2.n_triangles, "maxdiff", float(np.abs(np.sort(m2.positions, 0) - np.sort(m.positions, 0)).max()))
