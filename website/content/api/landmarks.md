# LandmarksWidget API

Reference for `milume.peek` and the synced widget handle it returns. For a
walkthrough, see [Quickstart](../quickstart.md).

## `milume.peek`

Open a Milume surface on AnnData or SpatialData. This is the main notebook
entry point; it constructs `LandmarksWidget` with the same keyword arguments.

```python
import milume

w = milume.peek(adata, color="cell_type")
w = milume.peek(sdata)  # table, cell polygons, image inferred
```

Returns a `LandmarksWidget` handle. Synced traitlets include `w.selections` and
`w.landmarks`; join to `adata` with `get_obs_names(region)`.

## Constructor parameters

--8<-- "api-params.md"

## Synced traitlets

--8<-- "api-traitlets.md"

## GeoDataFrame interchange

--8<-- "api-geodataframe.md"

## Methods

--8<-- "api-methods.md"
