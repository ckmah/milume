# Changelog

## Unreleased

### Migration (#394)

**Timeline.** `active_category` and `active_genes` remain on `LandmarksWidget` through 2.x. Assigning either emits `DeprecationWarning` and will fail in 3.0. All other removed top-level colour traits (below) are removed in the **next release** with no warning; observe the private synced traits or assign `color` instead.

**Exact warning** (only when you assign `active_category` or `active_genes` yourself):

```text
LandmarksWidget.<name> is deprecated and will be removed in 3.0; assign ``color`` instead (scanpy-style obs column, gene, gene list, or obsm key).
```

Replace `<name>` with `active_category` or `active_genes`.

**Before → after (Python).**

| Before | After |
| --- | --- |
| `w.active_category = "cell_type"` | `w.color = "cell_type"` |
| `w.active_genes = ["Abtb3", "Adamts2"]` | `w.color = ["Abtb3", "Adamts2"]` |
| `w.active_category` / `w.active_genes` to read the current colour | `w.color` (str or list of gene names) |
| `LandmarksWidget(adata, color="cell_type")` | unchanged |
| `ml.peek(adata, color="cell_type")` | unchanged (same kwargs as `LandmarksWidget`) |
| `ml.peek(adata, color=["Abtb3", "Adamts2"])` | gene blend at open |

**Removed top-level synced traits** (were internal in `public-api.json`, but observable in notebooks). No read/write shims; `#394` folds them into private dicts so one `color` assignment keeps kernel and browser aligned.

| Removed trait | Use instead |
| --- | --- |
| `color_mode`, `legend_title`, `legend_labels`, `raster_basis`, `raster_embedding_key` | `_color_state[...]` (observe `change:_color_state`); set colour via `w.color = ...` |
| `point_palette`, `color_vmin`, `color_vmax`, `gene_scale_mode`, `gene_log1p`, `raster_embedding_dims` | `_look[...]` (observe `change:_look`); ramp limits follow the active obs column when you set `w.color` |
| `category_columns`, `category_codes` | `_category_columns`, `_category_codes` |
| `gene_names` | `_color_options["genes"]` (list of `{name, vmin?, vmax?}`) |
| `raster_embedding_keys` | `_color_options["embeddings"]` (map of obsm key → channel count) |
| `gene_csc_indptr`, `gene_csc_indices`, `gene_csc_data` | `_gene_csc_indptr`, `_gene_csc_indices`, `_gene_csc_data` |
| `embedding_values`, `embedding_channel_labels`, `embedding_matrix`, `embedding_matrix_dim` | `_embedding_values`, `_embedding_channel_labels`, `_embedding_matrix`, `_embedding_matrix_dim` |
| `raster_obs_key` | **No replacement** (unused dead trait) |
| `raster_gene_mode` | **No replacement** (gene aggregate Mean/Median/Max is browser-only chrome) |

**Shim choice.** Only `active_category` and `active_genes` stay as deprecated public traits because they were documented notebook setters and reads; they still mirror `color` without warnings when the widget updates them internally. We did not add deprecated properties for `color_mode` or `gene_names` because observers on those names would keep code on the old surface; migrating to `color` plus `_color_state` / `_color_options` is the supported path.

**Signed numeric obs (decoupler / LIANA-style scores).** When a column's finite values span zero (`min < 0 < max`), the widget auto-selects a diverging palette (ColorBrewer-style blue → neutral → red, neutral at 0), symmetric limits `±max(|v|)`, and sets `_look["color_diverging"]`. Sequential columns keep the cream→magenta ramp and p99 cap. Override without a public API via `_look["color_diverging_override"]` (`true` / `false`) before re-assigning `color`; future chrome may expose this in the UI.

## 2.1.0 (unreleased)

### Added

- **Landmarks map image backdrop.** SpatialData widgets show a tissue image under scatter (volume comm + Zarr pyramid, multichannel 2D or Z-band max projection for 3D); Layers stack exposes visibility, alpha, contrast, and channel toggles ([#122](https://github.com/ckmah/milume/issues/122)).
- **`milume.datasets` / `milume.ds` (v1: ileum).** After ``import milume as ml``, ``ml.datasets`` and the alias ``ml.ds`` (same module object) expose scverse-style loaders for demo AnnData: ``ileum_merfish_xu2026()``, ``list_datasets()``, ``info()``, and ``fetch()`` with pinned-url download, sha256 verification, and ``$MILUME_DATA_DIR`` cache ([#380](https://github.com/ckmah/milume/issues/380)).
- **On-demand gene loading and the 8-gene picker.** `milume.peek(adata)` opens with gene names only; the browser fetches a gene's normalized sparse column from the kernel the first time it is coloured, then keeps it in an LRU cache (128 MiB). On a 170,057-cell × 18,028-gene matrix at 10% density (Atera WTA breast scale), the kernel's peak extra memory from construct through comm-open drops from about 9.6 GiB (2.0.0, extrapolated from 0.96 GiB and 1.88 GiB measured at 1/10 and 1/5 of the cells) to 77 MiB measured at full scale, and the gene part of the comm-open message drops from about 3.1 GiB to 0.3 MiB. The 2.0.0 path OOM-killed the Jupyter kernel on that dataset. `genes=[...]` still restricts the catalog and preloads it when it packs under 64 MiB; a larger list loads on demand with a `UserWarning`. Pick up to 8 genes: up to three blend one colour channel each; four or more colour by one combined value with **Mean** / **Median** / **Max** under the gene field. Fetching a gene from CSR `adata.X` binary-searches each cell's sorted column indices (about 47 ms vs 545 ms per gene on that matrix; [#241](https://github.com/ckmah/milume/issues/241), [#248](https://github.com/ckmah/milume/issues/248), [#253](https://github.com/ckmah/milume/issues/253)).
- **The `use-milume` skill.** One-line install via `npx skills add ckmah/milume --skill use-milume`, `python -m milume.skill install` (copies the version-matched file from the wheel into `.agents/skills/use-milume/SKILL.md`), or the Claude Code marketplace (`/plugin marketplace add ckmah/milume`, then `use-milume@milume`). `.claude-plugin/plugin.json` exposes only that skill; keep its `version` in sync with `milume.__version__` when releasing ([#338](https://github.com/ckmah/milume/issues/338)).

### Fixed

- The Inspect (**I**) shortcut works with the pointer over the map ([#364](https://github.com/ckmah/milume/pull/364), [#362](https://github.com/ckmah/milume/issues/362)).
- molab demo notebooks include explicit "click Run all" guidance ([#366](https://github.com/ckmah/milume/pull/366), [#361](https://github.com/ckmah/milume/issues/361)).
- Vertex-only lasso and polygon selections populate Measure category counts instead of "No category counts in this scope" ([#371](https://github.com/ckmah/milume/pull/371), [#370](https://github.com/ckmah/milume/issues/370)).
- Pressing Escape in the Explore genes picker only closes the popup; it no longer clears every picked gene when the popup was already closed ([#252](https://github.com/ckmah/milume/issues/252)).
- On Python 3.14, `uv add milume` with `matplotlib>=3.11.2` no longer fails building ancient `s3fs` 0.3.5; declare `s3fs>=2024.1` ([#350](https://github.com/ckmah/milume/issues/350)).

### Changed

- **`color` is a `ColorSpec`.** Assign an obs column, a gene name, a gene list (blend), or an `obsm` key. Colour mode, legend, palette, category columns, the gene catalogue, and embedding packs sync as private traits (`_color_state`, `_look`, `_color_options`, `_category_columns`, `_category_codes`, `_embedding_*`, `_gene_csc_*`) instead of top-level `color_mode`, `legend_*`, `category_columns`, `gene_names`, `raster_basis`, and `raster_embedding_key` ([#394](https://github.com/ckmah/milume/issues/394)).

- **Map panel layout (option 1).** Left dock accordion (Selections · Landmarks · Layers), right data card tabs (cat · num · genes · embed), a reserved depth-rail chrome slot (behaviour in [#122](https://github.com/ckmah/milume/issues/122)), minimise mode (Shift+\\), and Spline as the default landmark tool ([#393](https://github.com/ckmah/milume/issues/393)).
- **`channels=` on `LandmarksWidget` / `milume.peek`.** Pass channel names to show on open for the SpatialData tissue image; unknown names raise before render ([#122](https://github.com/ckmah/milume/issues/122)).

- **Lighter core install.** `matplotlib`, `polars`, and `leidenalg` (and `igraph` with it) are no longer installed by `pip install milume`. Category columns use pandas categorical codes (same labels, order, and colours); lasso hit-testing uses a numpy port of matplotlib's point-in-path test. Tab10/tab20 palettes are hardcoded with the same hex values. Demo notebooks and the Squidpy niche recipe still need `leidenalg` where they call `sc.tl.leiden`.
- **Dependency floors.** `spatialdata>=0.7.3` (>=0.8.0 on Python 3.12+ so anndata 0.13 cannot pair with broken 0.7.3). `pyarrow>=16` is declared for cell-polygon parquet. `s3fs>=2024.1` on Python 3.14.
- **Smaller sdist.** The source distribution no longer ships `website/`, README screenshots, Playwright snapshots, or vendored `.agents/` / `.cursor/` config (~60 MB to ~4.3 MB). Wheel contents unchanged.
- **Minified widget bundle.** `milume/static/bundled/landmarks.mjs` ships minified (5.17 → 3.99 MB raw; 1.41 → 1.24 MB gzip) ([#318](https://github.com/ckmah/milume/issues/318)).
- **Inspect contrast default.** When `contrast_limits` is omitted, the upper limit is the max of the coarsest pyramid level instead of the 99.5th percentile (colon A2 default goes from `(0, 171)` to `(0, 249)`).
- Inspect segmentation meshes default to **0.6** peak opacity (was 0.9).


### Deprecated

- `LandmarksWidget.active_category` and `active_genes` are derived from `color` and will be removed in 3.0. Assign `color` instead. Warning text: ``LandmarksWidget.<name> is deprecated and will be removed in 3.0; assign ``color`` instead (scanpy-style obs column, gene, gene list, or obsm key).`` ([#394](https://github.com/ckmah/milume/issues/394)).

### Removed

- The `milume[demo]` pip extra. Use each demo notebook's PEP 723 inline script header, or `uv sync --group demo` from a checkout.
- Internal synced traits `gene_format` and `gene_values` (not documented public API). With `genes=None` nothing is preloaded; preloaded `genes=[...]` always ships sparse CSC via `_gene_csc_*`. The gene catalogue is `_color_options["genes"]` (no top-level `gene_names`).

### Docs

- Squidpy colour recipes, Diátaxis restructure (how-to, tutorials, reference), Datasets and Concepts pages, and demo-tier loader notes ([#343](https://github.com/ckmah/milume/issues/343), [#354](https://github.com/ckmah/milume/issues/354), [#339](https://github.com/ckmah/milume/issues/339)).

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
