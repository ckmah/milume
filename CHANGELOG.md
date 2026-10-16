# Changelog

## 1.4.0 (unreleased)

Breaking: no deprecation release.

### Color is one trait

`w.color = key` is the only way to colour the points. `key` is an `adata.obs` column (categorical or numeric) or a packed gene. An unknown key raises `milume.ColorKeyError` (a `KeyError`); a gene that was not packed, or a category column with more than 128 levels, raises `milume.ColorValueError` (a `ValueError`). Nothing changes when it raises.

Migration:

| 1.3.x | 1.4.0 |
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

| 1.3.x | 1.4.0 |
|---|---|
| `w.get_obs_names(adata, sel_id)` / `w.get_obs_names(selection_id=sel_id)` | `w.get_obs_names(sel_id)` |
| `w.get_obs_names(adata, "missing")` returned an empty array | raises `KeyError` |
| `w.get_obs_names()` / `selection_id="all"` / `None` returned every cell | `adata.obs_names` |
| `w.get_focus_obs_names(adata)` | `w.get_obs_names("focus")` |
| `w.assign_obs_mask(adata, key, sel_id)` | `adata.obs[key] = adata.obs_names.isin(w.get_obs_names(sel_id))` |
| result was a `np.ndarray` of str | result is a `pd.Index` |
