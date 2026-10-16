"""Harness stand-in for the comm: serves /cellmesh/<x0,y0,x1,y1>.bin from milume.cell_mesh (default params)."""
import stub, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from load_small import load
from milume.cell_mesh import CellMeshCache, MeshParams

gdf, labels, xy, zs = load()
cache = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, MeshParams(z_step_um=zs))
if "--warm" in sys.argv:
    t = time.time(); cache.build(cache.cells); print("warm all", time.time() - t, flush=True)

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            key = self.path.split("/cellmesh/")[1].removesuffix(".bin")
            x0, y0, x1, y1 = map(float, key.split(","))
            t = time.time(); b = cache.window_bytes(x0, y0, x1, y1)
            print(f"{key} {len(b)} B {time.time()-t:.3f}s", flush=True)
            self.send_response(200); self.send_header("Content-Type", "application/octet-stream"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        except Exception as e:
            self.send_response(400); self.end_headers(); self.wfile.write(str(e).encode())
    def log_message(self, *a): pass

ThreadingHTTPServer(("127.0.0.1", 8766), H).serve_forever()
