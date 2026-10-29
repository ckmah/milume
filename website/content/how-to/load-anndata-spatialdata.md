# Load AnnData / SpatialData

How to open milume on common spatial omics containers. Platform-specific SpatialData loaders are filled in during phase 3 ([#339](https://github.com/ckmah/milume/issues/339)).

## AnnData

Coordinates must live in `obsm["spatial"]`:

```python
import milume

w = milume.peek(adata, color="cell_type")
w  # display in the notebook
```

Constructor parameters and traitlets are in the [LandmarksWidget API](../reference/api/landmarks.md).

## SpatialData

### Pyxa

Stub. Pyxa output into SpatialData and opening it in milume will be documented here.

### Xenium

Stub. Xenium output into SpatialData and opening it in milume will be documented here.

### CosMx

Stub. CosMx output into SpatialData and opening it in milume will be documented here.

For a minimal SpatialData open today:

```python
w = milume.peek(sdata, color="cell_type")  # table, labels, image inferred
```
