# GPU vs CPU cell-mesh building: exploration (branch `proto-cell-mesh-gpu`)

This is exploration only. Nothing here is wired into `milume/` or the renderer.

Data: HF Stellaromics/demo small, 4,372 cells. The 100 and 300 µm windows are centred on (1443, −5190), the same as `bench_mesh.py`.
Box: 8 vCPU and **no GPU** (no `/dev/dri`, no `nvidia-smi`). The WebGPU numbers come from **SwiftShader**, which emulates a GPU on the CPU. They show that the kernels are correct, not how fast a real GPU would be.

## Files
| file | what |
|---|---|
| `profile_cpu.py` | cProfile of the shipped mesher on a cold 300 µm window (results in `results/gpu-profile.log`) |
| `cpu_vec.py` | candidate 3: batched shapely matching plus a fork-pool loft. Output is identical to `mesh_cell` |
| `surface_nets.py` | candidate 2: multi-label surface nets, array-API style (numpy now, drop-in CuPy) |
| `surface_nets_nb.py` | the same algorithm written as GPU-shaped kernels (count → scan → place → qcount → scan → emit → smooth), run with numba prange |
| `browser/sn.js`, `browser/index.html`, `browser/run.mjs` | candidate 1: WebGPU compute (WGSL) port of those kernels, plus a plain-JS CPU fallback |
| `export_crops.py` | writes label-volume crops for the browser bench |
| `calib.py` | measures the offset between the label volume and the polygons |
| `bench_all.py`, `correctness.py`, `metrics.py` | timings, sizes, and correctness (same metrics as `bench_mesh.py`) |
| `results/` | raw JSON from the runs |

## Run on a real GPU (e.g. Clarence's Mac, Chrome or Safari 26)
```
python scripts/cell-mesh-gpu/export_crops.py            # DATA=... to choose the folder
ln -s $DATA scripts/cell-mesh-gpu/browser/data
node scripts/cell-mesh-gpu/browser/run.mjs s1_100,s1_300,s0_100 js,webgpu native
```
