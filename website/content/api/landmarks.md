# LandmarksWidget API

Generated from the public Python API. For a walkthrough, see
[Quickstart](../quickstart.md).

## `milume.peek`

Open a Milume surface on AnnData or SpatialData. This is the main notebook
entry point; it constructs `LandmarksWidget` with the same keyword arguments.

```python
import milume

w = milume.peek(adata, color="cell_type")
w = milume.peek(sdata)  # table, labels, image inferred
```

Returns a `LandmarksWidget` handle. Synced traitlets include `w.selections` and
`w.landmarks`; join to `adata` with `get_obs_names` / `assign_obs_mask`.

## Constructor parameters and traitlets

--8<-- "api-params.md"

## `LandmarksWidget`

::: milume.landmarks.LandmarksWidget
    options:
      show_root_heading: true
      show_source: false
      members_order: source
      filters:
        - "!^set_neighbor_graphs$"
