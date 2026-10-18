import time, numpy as np, common
from milume.cell_mesh import CellMeshCache, MeshParams
from surface_nets import surface_nets, packed_bytes
gdf, labels, xy, zs = common.load_polygons()
cache = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, MeshParams(z_step_um=zs))
print("Z_um sample", np.unique(gdf.Z_um.to_numpy())[:5])
S = np.array([0.5, 0.45993900299072266, 0.45993900299072266]); T = np.array([-1.0053027092508273, -5414.147568225861, 784.2817039489746])
arr = common.label_array("s0")
for win in (100, 300):
    cells = cache.cells_in(*common.window_box(win))
    bb = np.array([cache.bbox[c] for c in cells]); x0, y0 = bb[:, :2].min(0); x1, y1 = bb[:, 2:].max(0)
    ix0 = max(int((x0 - T[2]) / S[2]) - 1, 0); ix1 = int((x1 - T[2]) / S[2]) + 2
    iy0 = max(int((y0 - T[1]) / S[1]) - 1, 0); iy1 = int((y1 - T[1]) / S[1]) + 2
    t = time.perf_counter(); vol = arr[:, iy0:iy1, ix0:ix1]; tio = time.perf_counter() - t
    keep = [cache.label[c] for c in cells]
    t = time.perf_counter(); m = surface_nets(vol, S, T + S * np.array([0, iy0, ix0]), keep_labels=keep); dt = time.perf_counter() - t
    print(win, "cells", len(cells), "vol", vol.shape, f"read {tio:.2f}s mesh {dt:.2f}s", "tris", m.n_triangles, "verts", len(m.positions), "bytes", packed_bytes(m), "labels hit", len(np.unique(m.vert_label)), flush=True)
