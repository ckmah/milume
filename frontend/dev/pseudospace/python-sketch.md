# Pseudospace sketch

Not a public API. Nothing here is added to `milume.__all__`.

```python
frame = w.get_pseudospace("axis-1")
profile = w.get_pseudospace_profile("axis-1", gene="Apob")
```

`frame` is a DataFrame with one row per cell.

| column | meaning |
| --- | --- |
| `pseudospace` | `(k-1) + d_k / (d_k + d_k+1)` for the closest consecutive pair |
| `pair` | 0-based index of that pair |
| `d_<landmark>` | geodesic distance in µm to that landmark's geometry |

`profile` is a DataFrame of bins along pseudospace. A gene bin has `mean`, `lo`, `hi`, and the Spearman rho of the gene against pseudospace. A category bin has one proportion column per label.

The ileum notebook in this directory is the showcase. It is not a recipe and it does not ship.
