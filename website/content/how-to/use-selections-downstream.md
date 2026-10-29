# Use selections downstream

`w.selections` updates on every edit in the browser. After you draw a region,
join to observations by name (not row index):

```python
import pandas as pd

sel_id = w.selections[-1]["id"]
hits = w.get_obs_names(sel_id)  # pd.Index; "focus" reads the focused selection or types
adata.obs["in_lasso"] = adata.obs_names.isin(hits)

summary = pd.DataFrame({"cell_type": adata.obs.loc[hits, "cell_type"].value_counts()})
```

Landmarks (`w.landmarks`) are durable geometric annotations; selections are
analysis regions. See the [LandmarksWidget API](../reference/api/landmarks.md) for traitlets and
methods.
