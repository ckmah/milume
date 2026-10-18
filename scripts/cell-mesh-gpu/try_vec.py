import time, numpy as np, common
from milume.cell_mesh import CellMeshCache, MeshParams, mesh_cell
from cpu_vec import VecMesher
gdf, labels, xy, zs = common.load_polygons()
p = MeshParams(z_step_um=zs)
g = gdf[gdf.cell_id == gdf.cell_id.iloc[0]]; mesh_cell(zip(g.Z_um, g.geometry), p)
cache = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, p)
vm = VecMesher(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), p)
for win in (100, 300):
    cells = cache.cells_in(*common.window_box(win))
    tm = {}; t = time.perf_counter(); ms = vm.build(cells, tm); dt = time.perf_counter() - t
    ref = [mesh_cell(zip(*[a[cache._span[c][0]:cache._span[c][1]] for a in (cache._z, cache._g)]), p) for c in cells[:60]]
    same = sum(a.n_triangles == b.n_triangles and np.allclose(a.positions, b.positions) for a, b in zip(ms, ref))
    st = [vars(a.stats) == vars(b.stats) for a, b in zip(ms, ref)]
    print(win, len(cells), f"{dt:.2f}s", {k: round(v, 2) for k, v in tm.items()}, "tris", sum(m.n_triangles for m in ms), "identical", same, "/", len(ref), "stats eq", sum(st), flush=True)
    bad = [(vars(a.stats), vars(b.stats)) for a, b in zip(ms, ref) if vars(a.stats) != vars(b.stats)][:2]; print(bad)
