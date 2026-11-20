# Pseudospace sketch

Not a public API. The harness options only choose an ordered landmark id list and read this field back.

```python
w.pseudospaces.add(["harness-shape", "harness-line"], id="axis-1")

s = w.get_pseudospace("axis-1")
d = w.get_pseudospace_distances("axis-1")

adata.obs["pseudospace"] = s
adata.obs[d.columns] = d
```

`s` is a Series. A cell between landmarks `L_k` and `L_k+1` has value `(k-1) + d_k / (d_k + d_k+1)`, and it belongs to the consecutive pair with the smallest `d_k + d_k+1`. `d` is a DataFrame, one geodesic distance column per landmark in the order. There is no side or left/right offset.

The prototype method name is `knn-graph`: distance to each landmark's geometry on an 8-nearest-neighbor cell graph, edge weights in micrometers. Cells before the first landmark or past the last stay inside `[0, n-1]` because every cell is assigned to a pair.
