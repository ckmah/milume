# Use selections downstream

Carry lasso, rectangle, and inspect selections into pandas, Scanpy, or other Python analysis.

## Goal

Turn the cells inside a map selection into an observation subset or a boolean column on `adata.obs`.

## Steps

1. Open milume on AnnData with spatial coordinates (ileum demo):

```python
import milume as ml

adata = ml.ds.ileum_merfish_xu2026()
w = ml.peek(adata, color="cell_type")
w
```

2. Draw a selection in the browser ([Select regions](../reference/ui/select-regions.md)). Each edit updates `w.selections`.

3. Read the latest selection id and the cell names it covers:

```python
sel_id = w.selections[-1]["id"]
hits = w.get_obs_names(sel_id)  # pd.Index of obs_names
```

4. Join to observations by name (not row index):

```python
adata.obs["in_selection"] = adata.obs_names.isin(hits)
adata_sel = adata[hits].copy()
```

5. Run downstream code on the subset or the flag. Example summary table:

```python
import pandas as pd

summary = pd.DataFrame(
    {"cell_type": adata.obs.loc[hits, "cell_type"].value_counts()}
)
```

Use `w.get_obs_names("focus")` when the focused selection in the UI is the one you want ([Methods](../reference/api/landmarks.md#methods)).

## Result

`hits` and `adata_sel` (or `adata.obs["in_selection"]`) stay aligned with the map. Re-run steps 3–5 after you change selections in the widget.

Landmarks (`w.landmarks`) are durable geometry; selections are analysis regions. Traitlets and edge cases are in the [LandmarksWidget API](../reference/api/landmarks.md).
