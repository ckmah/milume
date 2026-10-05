"""Print what an agent needs to know about every milume widget in the kernel.

Run it in the notebook kernel (marimo-pair: `bash scripts/execute-code.sh --url <url> <path>/orient.py`).
Read-only: it changes nothing.
"""
import numpy as np

try:
    from milume import LandmarksWidget
except ImportError:
    raise SystemExit("milume is not importable in this kernel")

import importlib.metadata as _md

print("milume", _md.version("milume"))

_ns = dict(globals())
_seen = {}
for _name, _obj in _ns.items():
    if _name.startswith("_"):
        continue
    _w = _obj if isinstance(_obj, LandmarksWidget) else getattr(_obj, "widget", None)
    if isinstance(_w, LandmarksWidget) and id(_w) not in _seen:
        _seen[id(_w)] = (_name, _w)

if not _seen:
    print("no LandmarksWidget in the kernel namespace; construct one with milume.peek(adata_or_sdata)")

for _name, _w in _seen.values():
    _ad_name, _ad = next(
        ((_n, _o) for _n, _o in _ns.items() if not _n.startswith("_") and hasattr(_o, "obsm") and hasattr(_o, "obs_names") and len(_o.obs_names) == len(_w._data_x)),
        (None, None),
    )
    print(f"\n== widget variable `{_name}`, AnnData variable `{_ad_name}`")
    xb, yb = _w.x_bounds, _w.y_bounds
    print(f"extent (µm): x {xb[0]:.0f}..{xb[1]:.0f}, y {yb[0]:.0f}..{yb[1]:.0f}; mode={_w.mode!r}; color={_w.active_category or _w.color_by!r}; genes shown={list(_w.active_genes)}")
    print("categorical columns:", {c["name"]: len(c["labels"]) for c in _w.category_columns})
    print("gene catalog:", len(_w.gene_columns), "genes")
    print("landmarks:")
    for _lm in _w.landmarks:
        _v = np.asarray(_lm.get("vertices") or [[np.nan, np.nan]])
        print(f"  {_lm['id']!r} {_lm['type']} n_vertices={len(_v)} bbox=({_v[:,0].min():.0f},{_v[:,1].min():.0f})..({_v[:,0].max():.0f},{_v[:,1].max():.0f}) buffer={_lm.get('buffer_width', 0)}")
    print("selections:")
    for _s in _w.selections:
        _n = len(_s["point_indices"]) if _s.get("point_indices") is not None else "geometry"
        print(f"  {_s['id']!r} type={_s['type']} cells={_n} neighborhood={_s.get('neighborhood')}")
    print(f"focused: {_w.selected_kind or 'none'} #{_w.selected_index}; inspect window: ({_w.inspect_cx}, {_w.inspect_cy}) size {_w.inspect_size_um} µm; volume: {'yes' if _w.volume else 'no'}")
    if _ad is not None:
        print("adata:", _ad.shape, "obsm:", list(_ad.obsm), "spatial dims:", np.asarray(_ad.obsm["spatial"]).shape[1])
        print("obs columns:", list(_ad.obs.columns))
        _pre = [c for c in _ad.obs.columns if c.startswith(("dist_", "s_")) or "distance" in c.lower()]
        if _pre:
            print("precomputed measure columns (check sign and units before trusting):", _pre)
