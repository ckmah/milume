"""Where does the shipped CPU mesher spend its time? cProfile of a cold 300 µm window (1 thread)."""
import cProfile, pstats, time, io
import common
from milume.cell_mesh import CellMeshCache, MeshParams, mesh_cell

gdf, labels, xy, zs = common.load_polygons()
p = MeshParams(z_step_um=zs)
g = gdf[gdf.cell_id == gdf.cell_id.iloc[0]]; mesh_cell(zip(g.Z_um, g.geometry), p)  # numba warm-up
cache = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, p)
cells = cache.cells_in(*common.window_box(300))
pr = cProfile.Profile(); t = time.perf_counter(); pr.enable()
cache.build(cells, workers=1)
pr.disable(); print(f"300um window, {len(cells)} cells, 1 thread: {time.perf_counter() - t:.2f}s")
s = io.StringIO(); pstats.Stats(pr, stream=s).sort_stats("tottime").print_stats(25); print(s.getvalue())
