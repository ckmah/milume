# Changelog

## 2.0.1 (unreleased)

### Agent skill: one-line install ([#338](https://github.com/ckmah/milume/issues/338))

- The `use-milume` skill lives at `skills/use-milume/SKILL.md` (not under vendored `.agents/`). `npx skills add ckmah/milume --skill use-milume` installs only that skill; `python -m milume.skill install` copies the version-matched file from the wheel into `.agents/skills/` as `use-milume/SKILL.md`. Claude Code users can add the repo marketplace (`/plugin marketplace add ckmah/milume`) and install `use-milume@milume`; `.claude-plugin/plugin.json` exposes only that skill (not vendored `.agents/skills`). Keep `plugin.json` `version` in sync with `milume.__version__` when releasing.

### Genes load on demand, so whole-transcriptome panels open ([#241](https://github.com/ckmah/milume/issues/241))

- `milume.peek(adata)` no longer packs every gene at construct. The widget opens with gene names only, and the browser fetches a gene's normalized sparse column from the kernel the first time it is coloured, then keeps it in an LRU cache (128 MiB). On a 170,057-cell × 18,028-gene matrix at 10% density (Atera WTA breast scale), the kernel's peak extra memory from construct through comm-open drops from about 9.6 GiB (2.0.0, extrapolated from 0.96 GiB and 1.88 GiB measured at 1/10 and 1/5 of the cells) to 77 MiB measured at full scale, and the gene part of the comm-open message drops from about 3.1 GiB to 0.3 MiB. The 2.0.0 path OOM-killed the Jupyter kernel on that dataset.
- `genes=[...]` still restricts the catalog and preloads it when it packs under 64 MiB. A larger list loads on demand too, with a `UserWarning`, instead of sending a multi-GB payload; the old warn-and-send-anyway 25 MiB threshold is gone. Colouring by a gene outside the catalog still raises `milume.ColorValueError`.
- The browser densifies one cell-length column per gene on screen, never the whole matrix (2D points, raster bins, the Inspect cube and the info-panel densities).
- Pick up to 8 genes. Up to three blend one colour channel each, as before. Four or more colour by one combined value on a single ramp, with **Mean** / **Median** / **Max** under the gene field.
- Fetching a gene from a CSR `adata.X` (the usual AnnData layout) no longer scans the whole matrix. The kernel binary-searches each cell's sorted column indices instead, with no index built and no extra memory kept. On the 170,057 × 18,028 matrix (307M stored values, memory-mapped) one gene now takes about 47 ms instead of 545 ms, and a 16-gene request about 375 ms instead of 590 ms. The first fetch also checks once that the rows are sorted (about 0.3 s from page cache); CSR with unsorted or duplicate entries keeps the old scan. CSC input was already fast and is unchanged ([#253](https://github.com/ckmah/milume/issues/253)).
- Pressing Escape in the Explore genes picker now only closes the popup. It used to clear every picked gene when the popup was already closed ([#252](https://github.com/ckmah/milume/issues/252)); the × button and each chip's remove still clear.
- The synced gene-catalogue trait `gene_columns` is renamed `gene_names`, with no deprecated alias. It stays internal (not listed in the notebook API), but code that read `w.gene_columns` should now read `w.gene_names`.
- The synced traits `gene_format` and `gene_values` are removed. A preloaded `genes=[...]` list always ships as sparse CSC (`gene_csc_indptr` / `gene_csc_indices` / `gene_csc_data`), and with `genes=None` nothing is preloaded: those traits stay empty and genes arrive per gene on demand.

### Install: lighter core dependencies

- `leidenalg` (and `igraph` with it) is no longer installed by `pip install milume`. milume never imports it; the demo notebook and the Squidpy niche recipe need it for `sc.tl.leiden`. Install it yourself with `pip install leidenalg`, or run the notebook from its own inline script header (`uvx marimo edit --sandbox demos/landmarks.py`, or molab), which already lists it.
- `spatialdata` stays a core dependency, now `spatialdata>=0.7.3` (was `>=0.2`). Older releases fail to import (`xarray-schema` needs `pkg_resources`) or fail to write the Zarr store the Inspect cube reads with current geopandas / zarr / ome-zarr.
- On Python 3.12+ the `spatialdata` floor is `>=0.8.0` (3.11 keeps `>=0.7.3`). anndata 0.13, which needs Python 3.12+, breaks spatialdata 0.7.3 (`TableModel.parse` fails), so holding spatialdata at 0.7.3 there gave a broken install. 0.8.0 is the first release that works with anndata 0.13, and it pulls the same dependencies as 0.7.3. Fresh installs already resolve 0.8.0, so nothing new is downloaded (#315).
- The `demo` extra is removed: `pip install "milume[demo]"` no longer exists. Each demo notebook lists its own dependencies in its PEP 723 inline script header; from a checkout, `uv sync --group demo` installs them as a development dependency group.
- `pyarrow>=16` is now declared; milume reads cell-polygon parquet with it. It was already installed through `spatialdata`, so nothing new is downloaded.
- `matplotlib` is no longer installed by `pip install milume` (nor contourpy, cycler, fonttools, kiwisolver, pyparsing): about 17 MB less to download and 54 MB less installed on Linux / Python 3.12. The tab10/tab20/tab20b/tab20c category palettes and the default sequential palette are hardcoded with the same hex values, and lasso / polygon selection uses a numpy port of matplotlib's point-in-path test that gives the same cells (points on an edge and self-intersecting lassos included). `import milume` is about 0.3 s faster because `matplotlib.pyplot` is no longer imported. Install matplotlib yourself if your own plotting code needs it.

### Smaller sdist

- The source distribution no longer ships `website/`, the README screenshots (`assets/*.png`), the Playwright e2e snapshots or the vendored `.agents/` skills and `.cursor/` config (the `use-milume` skill is still included), dropping it from about 60 MB to about 4.3 MB. The wheel contents are unchanged. The install docs now show `uv pip install --compile-bytecode milume`.

### Widget bundle is minified

- `milume/static/bundled/landmarks.mjs` now ships minified: 5.17 → 3.99 MB raw (1.41 → 1.24 MB gzip), still one file. Vite's ES library mode kept whitespace; the build now strips it with the same esbuild minifier ([#318](https://github.com/ckmah/milume/issues/318)).

### Inspect image contrast default reaches the image max

- When `contrast_limits` is not passed, the Inspect cube's default upper limit is now the max of the image's coarsest pyramid level instead of its 99.5th percentile; the lower limit stays at the 1st percentile. The coarsest level already compresses the dynamic range, so the percentile clipped bright tissue to white (on the colon A2 image the default goes from `(0, 171)` to `(0, 249)`), which washed out a top z cut and hid the cell meshes behind it. Passing `contrast_limits=(lo, hi)` works as before.

### Docs: Squidpy color recipes

- [Integrations / Squidpy color](https://ckmah.github.io/milume/docs/integrations/squidpy-color/) documents `sq.gr.calculate_niche` → `w.color = nhood_niche_res=<resolution>` and Moran's I top gene → `w.color`, with harness screenshots.
- The [use-milume](skills/use-milume/SKILL.md) skill lists the same recipes; optional pytest coverage lives in `tests/test_squidpy_color_recipes.py` when `squidpy` is installed.

### Install: polars is no longer a dependency

- `pip install milume` no longer installs polars (polars + polars-runtime-32): about 59 MB less to download and 225 MB less installed on Linux / Python 3.12. Category columns are now encoded with pandas categorical codes; labels, their order, colours and `w.category_colors()` are unchanged, and colouring a 170k-cell obs is faster (constructor category pass about 210 → 60 ms, `w.color = "<category>"` about 55 → 17 ms). `LandmarksWidget.set_expression` still accepts a polars DataFrame when you have polars installed.

## 2.0.0 (2026-10-19)

Breaking: no deprecation release.

### Color is one trait

`w.color = key` is the only way to colour the points. `key` is an `adata.obs` column (categorical or numeric) or a packed gene. An unknown key raises `milume.ColorKeyError` (a `KeyError`); a gene that was not packed, or a category column with more than 128 levels, raises `milume.ColorValueError` (a `ValueError`). Nothing changes when it raises.

Migration:

| 1.3.x | 2.0.0 |
|---|---|
| `w.set_color(adata.obs["cell_type"])` | `w.color = "cell_type"` |
| `w.set_color(gene_values, legend_title="APOB")` | `w.color = "APOB"` |
| `w.set_color(values)` for a computed array | `adata.obs["score"] = values; w.color = "score"` |
| `w.set_points(x, y, color=..., color_map=..., legend_title=..., continuous_range=...)` | `w.set_points(x, y)` then `w.color = key` |
| `w.color_by` | removed; the internal mode is derived from `w.color` |

Custom category colours still come from `adata.uns["<column>_colors"]`.

### One region reader

`w.get_obs_names(region)` is the only way to read cells in a region. `region` is required: a selection id from `w.selections`, or `"focus"` for the focused selection or category groups (empty when nothing is focused). It returns a `pd.Index` and raises `KeyError` for an unknown id. The `adata` argument is gone; the widget's own coordinates and `obs_names` are used.

Migration:

| 1.3.x | 2.0.0 |
|---|---|
| `w.get_obs_names(adata, sel_id)` / `w.get_obs_names(selection_id=sel_id)` | `w.get_obs_names(sel_id)` |
| `w.get_obs_names(adata, "missing")` returned an empty array | raises `KeyError` |
| `w.get_obs_names()` / `selection_id="all"` / `None` returned every cell | `adata.obs_names` |
| `w.get_focus_obs_names(adata)` | `w.get_obs_names("focus")` |
| `w.assign_obs_mask(adata, key, sel_id)` | `adata.obs[key] = adata.obs_names.isin(w.get_obs_names(sel_id))` |
| result was a `np.ndarray` of str | result is a `pd.Index` |
| a hidden selection returned no cells | a hidden selection returns its cells (hiding only affects display) |

### Open, move and close the Inspect cube from Python

New: `w.inspect_open` opens and closes the Inspect cube without a click (needs a widget built from SpatialData with a 3D image).

```python
w.inspect_cx, w.inspect_cy = 120.0, 140.0  # optional: with no window placed it opens at the volume centre
w.inspect_open = True                      # switches to Inspect and opens the cube there
w.inspect_cx = 150.0                       # moves the window and the open cube
w.inspect_open = False                     # closes it and exits Inspect, like Exit
```

- Setting `inspect_cx` / `inspect_cy` now moves the map's window square too, not only the cube.
- The default position is the volume centre: `w.inspect_open = True` with `inspect_cx` / `inspect_cy` still `None` opens the cube there.
- `inspect_open` follows the browser: opening the cube there (a click) reads `True`; Esc or Exit reads `False`.
- Behaviour change: one Esc in Inspect now closes the cube and leaves Inspect, back to the previous tool (Select if none), like Exit. It used to take two (close the cube, then leave), which left the widget in Inspect while `inspect_open` read `False`.
- `w.inspect_open = True` without a 3D image raises `ValueError`.
- `volume` and `volume_cut` join `inspect_open` in the public API.

### Inspect cube: cell meshes from polygons

The Inspect cube draws each cell as a 3D mesh lofted in the browser from the store's per-slice cell polygons, instead of raycasting a label image. Default mesh opacity is 0.9.

Migration:

| 1.3.x | 2.0.0 |
|---|---|
| `milume.peek(sdata, labels="cells")` / `LandmarksWidget(..., labels=)` | `shapes="cell_boundaries_z"` (a shapes element with `cell_id` and `Z_um`) |
| `w.volume["labels_url"]` | `w.volume["cells"]` → `{url, bytes}` for the polygon parquet |
| `w.volume_label_ids` | `w.volume_cell_rows` (base64 int32, one table row per polygon cell; −1 when the table has none) |

Stores without per-slice cell polygons (e.g. Xenium / CosMx) open Inspect image-only, with no cells; 2D image plus polygon rendering is tracked in [#122](https://github.com/ckmah/milume/issues/122). With several 3D images, pass `image=` to pick one.

### Inspect cube: cell meshes composited by depth

- Cell meshes sit inside the image by depth instead of drawing over it ([#228](https://github.com/ckmah/milume/pull/228)): image in front of a cell (DAPI above a cell wall) shows in front of it, image behind it shows through the cell's opacity. Per pixel, the nearest cell's front and back walls are drawn; cells behind them are hidden there. In MIP mode the meshes draw over the projection.
- Default mesh `fresnelMin` is 0.35 (was 0.15); opacity stays 0.9.

### Inspect minimap

- The Inspect view has a minimap ([#226](https://github.com/ckmah/milume/pull/226) `inspect-minimap-218`). Click or drag on it to move the cube; the mouse wheel does nothing over it. It is lazy-loaded, so it costs nothing until Inspect opens.
- The minimap's active region (the 2D viewport rectangle and the Inspect window square) is drawn with square corners; it no longer rounds to a near-circle when zoomed in ([#232](https://github.com/ckmah/milume/pull/232) `minimap-square-region`).

### Merged pull requests (since [v1.3.5](https://github.com/ckmah/milume/releases/tag/v1.3.5))

- [#178](https://github.com/ckmah/milume/pull/178) — docs: readable API reference for milume 1.3.5
- [#180](https://github.com/ckmah/milume/pull/180) — Add Cloudflare Web Analytics beacon to Pages site
- [#181](https://github.com/ckmah/milume/pull/181) — Fix landing beacon inject ignoring explicit empty token
- [#183](https://github.com/ckmah/milume/pull/183) — Copy: spatial biology tagline + Star on GitHub navbar CTA
- [#184](https://github.com/ckmah/milume/pull/184) / [#185](https://github.com/ckmah/milume/pull/185) — Copy: headline Explore spatial biology in your notebook + 3D subtitle
- [#186](https://github.com/ckmah/milume/pull/186) — Docs: ROADMAP headline
- [#187](https://github.com/ckmah/milume/pull/187) — Docs: Tools & modes index, page template, and Navigate page
- [#188](https://github.com/ckmah/milume/pull/188) — Docs: Select regions page (Tools & modes)
- [#189](https://github.com/ckmah/milume/pull/189) — Docs: Landmarks page (Tools & modes)
- [#190](https://github.com/ckmah/milume/pull/190) — Docs: Color & layers page (Tools & modes)
- [#191](https://github.com/ckmah/milume/pull/191) — Docs: Probe and Measure pages (Tools & modes)
- [#192](https://github.com/ckmah/milume/pull/192) — Docs: Inspect in 3D page (Tools & modes)
- [#193](https://github.com/ckmah/milume/pull/193) — Docs: fix related-tools card links; lychee link check on Pages build
- [#194](https://github.com/ckmah/milume/pull/194) — Docs: Tools & modes visuals (Inspect points off, DOM callouts, cursor in loops)
- [#195](https://github.com/ckmah/milume/pull/195) — Docs: Inspect loops with visible cursor (dark-only)
- [#196](https://github.com/ckmah/milume/pull/196) / [#198](https://github.com/ckmah/milume/pull/198) — e2e: undo molab helper DOM on the shared worker page
- [#197](https://github.com/ckmah/milume/pull/197) / [#199](https://github.com/ckmah/milume/pull/199) — fix(volume-cube): apply cube host resize without a frame of lag
- [#200](https://github.com/ckmah/milume/pull/200) / [#204](https://github.com/ckmah/milume/pull/204) / [#210](https://github.com/ckmah/milume/pull/210) — e2e: trim slow Inspect cube gesture tests; Python-seed pan clamp, Save, Z-only cut
- [#201](https://github.com/ckmah/milume/pull/201) — Docs: Inspect media with labels at the 0.4 default
- [#208](https://github.com/ckmah/milume/pull/208) — Public-trait registry + `w.color = key` (breaking)
- [#211](https://github.com/ckmah/milume/pull/211) — Breaking `get_obs_names(region) -> pd.Index` (breaking)
- [#213](https://github.com/ckmah/milume/pull/213) — e2e: seed setup-only state from Python instead of gestures
- [#214](https://github.com/ckmah/milume/pull/214) — Drop marimo/molab e2e tests and marimo verification rules
- [#216](https://github.com/ckmah/milume/pull/216) — Add use-milume skill; generate API docs from `_PUBLIC_TRAITS`
- [#217](https://github.com/ckmah/milume/pull/217) — Open, move and close the Inspect cube from Python (`inspect_open`)
- [#220](https://github.com/ckmah/milume/pull/220) — Inspect: cell meshes from per-slice polygons replace the label image (breaking)
- [#222](https://github.com/ckmah/milume/pull/222) — Docs site: Open Graph / Twitter link-preview tags + social card
- [#223](https://github.com/ckmah/milume/pull/223) — Social card v3: active Inspect cube (Iso) with cell meshes on colon crypts
- [#228](https://github.com/ckmah/milume/pull/228) — Inspect: composite cell meshes inside the image raycast by depth
- [#226](https://github.com/ckmah/milume/pull/226) — Inspect: minimap overlay while the cube is open (#218)
- [#232](https://github.com/ckmah/milume/pull/232) — Minimap: draw the active region with square corners
