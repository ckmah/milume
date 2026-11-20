# /// script
# requires-python = ">=3.11,<3.15"
# dependencies = [
#     "leidenalg>=0.12",
#     "marimo>=0.25.1",
#     "marimo-studio==0.4.1",
#     "matplotlib>=3.8",
#     "milume",
#     "pyarrow>=15",
#     "squidpy>=1.6"
# ]
# [tool.marimo-studio]
# default = "docs"
# runtimes = ["server", "zero-python"]
# ///
"""Squidpy neighborhood niche coloring on ileum MERFISH."""

import marimo

__generated_with = "0.25.2"
app = marimo.App(width="medium")


@app.cell
def imports():
    import marimo as mo
    import matplotlib.pyplot as plt
    import milume as ml
    import numpy as np
    import pandas as pd
    import squidpy as sq

    return ml, mo, np, pd, plt, sq


@app.cell(hide_code=True)
def run_on_server_tip(mo):
    mo.md(r"""
    > **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook. After the server connects, click **Run all** (the ▶ button at the bottom right) to run the notebook.
    """)
    return


@app.cell
def load_adata(ml):
    # Your data: sc.read_h5ad("slice.h5ad")  # needs obsm["spatial"] and a cell-type column.
    adata = ml.ds.ileum_merfish_xu2026()
    return (adata,)


@app.cell
def niche_sweep(adata, sq):
    LEIDEN_RES = 0.3
    NICHE_KS = (8, 16, 64)
    N_NEIGHBORS = 15
    NICHE_RNG = 0
    niche_levels = {}
    for k in NICHE_KS:
        sq.gr.spatial_neighbors_knn(adata, n_neighs=k)
        sq.gr.calculate_niche_neighborhood(
            adata,
            groups="cell_type",
            scale=False,
            n_neighbors=N_NEIGHBORS,
            resolutions=LEIDEN_RES,
            rng=NICHE_RNG,
        )
        col = f"niche_k{k}"
        adata.obs[col] = adata.obs[f"nhood_niche_res={LEIDEN_RES}"].astype(str).astype("category")
        niche_levels[col] = int(adata.obs[col].nunique())
    adata_map = adata.copy()
    return LEIDEN_RES, N_NEIGHBORS, NICHE_KS, adata_map, niche_levels


@app.cell(hide_code=True)
def intro(LEIDEN_RES, N_NEIGHBORS, NICHE_KS, adata, mo, niche_levels):
    DOI_XU = "10.1016/j.chom.2026.01.018"
    DOI_SQUIDPY = "10.1038/s41592-021-01346-7"
    DOI_LIU = "10.1038/s41588-026-02813-6"
    k_lo, k_mid, k_hi = NICHE_KS
    n_lo = niche_levels[f"niche_k{k_lo}"]
    n_mid = niche_levels[f"niche_k{k_mid}"]
    n_hi = niche_levels[f"niche_k{k_hi}"]
    mo.md(f"""
    # Does gut lymphoid tissue sit in its own spatial domain?

    **Gut-associated lymphoid tissue (GALT)** aggregates immune and stromal cells into compact follicles
    that look unlike the surrounding **lamina propria** on a tissue section. If local neighborhoods carry biology,
    GALT patches should separate from villus epithelium on a map of cell-type context—not only on a manual layer label.

    We use one ileum slice from [Xu et al., 2026](https://doi.org/{DOI_XU}) (MERFISH, **{adata.n_obs:,}** cells).

    [`calculate_niche_neighborhood`](https://squidpy.readthedocs.io/en/stable/api/squidpy.gr.calculate_niche_neighborhood.html)
    ([Palla et al., 2021](https://doi.org/{DOI_SQUIDPY})) builds a spatial graph, summarizes the **cell-type mix**
    around each cell, and clusters those summaries with Leiden—like grouping street blocks by who lives next door,
    not by a single landmark. Following [Liu and Li, 2026](https://doi.org/{DOI_LIU}), we call those computed regional
    clusters **spatial domains** in the text below (column names stay `niche_k*`).

    We sweep **k** in **`{k_lo}`**, **`{k_mid}`**, and **`{k_hi}`** nearest neighbors so you can compare tight crypt-scale
    domains to villus-scale smoothing. Leiden resolution **`{LEIDEN_RES:g}`** with **`n_neighbors={N_NEIGHBORS}`** keeps
    **`niche_k{k_lo}`** at **{n_lo}** domains, **`niche_k{k_mid}`** at **{n_mid}**, and **`niche_k{k_hi}`** at **{n_hi}** on this slice.

    Open the map, color by **`niche_k{k_hi}`**, then try **`niche_k{k_lo}`**. The default composition plot uses three polygons,
    one per **GALT** patch on this section; draw your own lassos to compare other regions.

    **Caveat:** a different **k** or **`{LEIDEN_RES:g}`** resolution can split one anatomical region across several domain IDs.
    If labels look too fragmented, raise **k** or lower the resolution; if GALT melts into the lamina propria, lower **k**.

    [![Open in molab](https://marimo.io/molab-shield.svg)](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_color.py)
    """)
    return


@app.cell
def galt_region():
    # Tight convex hull per annotated GALT patch (DBSCAN clusters), no extra buffer (slice coordinates).
    GALT_POLYGONS = {
        "GALT 1": [
            (-3620.2, -125.98),
            (-3658.26, -112.54),
            (-3665.09, -107.44),
            (-3676.25, -98.46),
            (-3678.73, -73.95),
            (-3677.66, -65.59),
            (-3673.17, -51.78),
            (-3665.27, -39.7),
            (-3631.05, -31.14),
            (-3621.88, -35.79),
            (-3604.15, -47.5),
            (-3589.1, -65.9),
            (-3585.17, -73.5),
            (-3613.72, -121.79),
        ],
        "GALT 2": [
            (-3976.01, 1246.48),
            (-3989.17, 1253.08),
            (-4009.53, 1273.14),
            (-4011.83, 1279.79),
            (-4012.99, 1290.28),
            (-3992.68, 1334.9),
            (-3977.11, 1344.07),
            (-3950.67, 1356.98),
            (-3926.86, 1346.42),
            (-3894.02, 1330.06),
            (-3889.96, 1319.42),
            (-3898.3, 1283.95),
            (-3905.74, 1270.34),
            (-3944.06, 1256.34),
            (-3969.55, 1247.26),
        ],
        "GALT 3": [
            (-3034.12, 1667.94),
            (-3039.64, 1668.04),
            (-3055.85, 1676.73),
            (-3058.78, 1691.55),
            (-3057.83, 1698.77),
            (-3054.59, 1715.1),
            (-3027.98, 1747.03),
            (-2993.24, 1750.69),
            (-2983.99, 1747.98),
            (-2964.16, 1723.35),
            (-2961.4, 1715.74),
            (-2969.14, 1697.16),
            (-3000.04, 1679.67),
        ],
    }
    return (GALT_POLYGONS,)


@app.cell
def landmark_map(GALT_POLYGONS, adata_map, ml, mo):
    MAP_OBS_EVERY = 8
    adata_peek = adata_map[::MAP_OBS_EVERY].copy()
    w = mo.ui.anywidget(ml.peek(adata_peek, color="niche_k64"))
    if not list(w.selections or []):
        w.selections = [
            {
                "id": f"galt-{i}",
                "name": label,
                "type": "polygon",
                "vertices": [list(v) for v in verts],
            }
            for i, (label, verts) in enumerate(GALT_POLYGONS.items(), start=1)
        ]
    w
    return (w,)


@app.cell
def niche_composition(GALT_POLYGONS, adata_map, mo, np, pd, plt, w):
    _niche_col = w.color
    selections = list(w.selections or [])

    def _regions():
        _default_galt_ids = {"galt-1", "galt-2", "galt-3"}
        _sel_ids = {str(s["id"]) for s in selections}
        if selections and not _sel_ids.issubset(_default_galt_ids):
            return [
                (str(s.get("name") or s["id"]), w.get_obs_names(str(s["id"])))
                for s in selections
            ]
        from matplotlib.path import Path as MplPath

        _xy = np.asarray(adata_map.obsm["spatial"][:, :2], dtype=float)
        _regions = []
        for _label, _verts in GALT_POLYGONS.items():
            _mask = MplPath(_verts).contains_points(_xy)
            _regions.append((_label, adata_map.obs_names[_mask]))
        return _regions

    def _composition_figure():
        _regions_list = _regions()
        type_counts: dict[str, int] = {}
        for _, _obs in _regions_list:
            _sub = adata_map.obs.loc[_obs, ["cell_type", _niche_col]]
            for _ct, _n in _sub["cell_type"].value_counts().items():
                type_counts[str(_ct)] = type_counts.get(str(_ct), 0) + int(_n)
        top_types = [
            k
            for k, _ in sorted(type_counts.items(), key=lambda kv: kv[1], reverse=True)[:12]
        ]
        _palette = plt.cm.tab20(np.linspace(0, 1, len(top_types)))
        _type_colors = {ct: _palette[j] for j, ct in enumerate(top_types)}

        n_sel = len(_regions_list)
        fig, axes = plt.subplots(
            n_sel,
            1,
            figsize=(7.5, max(2.0, 2.2 * n_sel)),
            squeeze=False,
        )
        for _ax, (_label, _obs) in zip(axes[:, 0], _regions_list):
            _sub = adata_map.obs.loc[_obs, ["cell_type", _niche_col]]
            _ct = pd.crosstab(_sub[_niche_col], _sub["cell_type"])
            _ct = _ct.reindex(columns=top_types, fill_value=0)
            _ct = _ct.loc[_ct.sum(axis=1).sort_values(ascending=False).index]
            _y = np.arange(len(_ct))
            _left = np.zeros(len(_ct))
            for _cell_type in top_types:
                _vals = _ct[_cell_type].to_numpy()
                _ax.barh(_y, _vals, left=_left, color=_type_colors[_cell_type])
                _left = _left + _vals
            _ax.set_yticks(_y)
            _ax.set_yticklabels(_ct.index.astype(str))
            _ax.set_xlabel("cells")
            _ax.set_title(f"{_label} — cell-type mix by {_niche_col} domain (n={len(_obs):,})")

        handles = [
            plt.matplotlib.patches.Patch(color=_type_colors[ct], label=ct) for ct in top_types
        ]
        fig.legend(handles=handles, bbox_to_anchor=(1.02, 0.5), loc="center left", fontsize=8)
        fig.suptitle("Cell-type composition within each spatial domain", y=1.01)
        fig.tight_layout()
        return fig

    _composition_figure()


@app.cell(hide_code=True)
def takeaway(LEIDEN_RES, NICHE_KS, adata_map, mo, w):
    _color = w.color
    _domain_col = _color if _color in adata_map.obs else f"niche_k{NICHE_KS[-1]}"
    _n_domains = int(adata_map.obs[_domain_col].nunique())
    mo.md(f"""
    On this slice, **`{_domain_col}`** resolves **{_n_domains}** spatial domains at Leiden resolution **{LEIDEN_RES:g}**.
    If your regions and the three default **GALT** polygons share a dominant domain ID, Squidpy is picking up a repeatable cell-type context—not just border cells.

    Try another **k** column and ask whether that agreement holds or whether lymphoid patches only separate at a shorter graph range.
    """)
    return


if __name__ == "__main__":
    app.run()