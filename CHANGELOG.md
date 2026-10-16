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
