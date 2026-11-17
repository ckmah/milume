# LandmarksWidget API

Generated from `milume` sources. For narrative guides, see [Tutorial: explore cells in 2D](../../get-started/tutorial-explore-cells-2d.md).

## `peek()`

```python
def peek(data, **kwargs) -> LandmarksWidget
```

Open a Milume surface on AnnData or SpatialData.

Main notebook entry point for interactive landmarks. Constructs
`LandmarksWidget` with the same keyword arguments.

#### Parameters

- **data, adata** — AnnData with spatial coordinates, or SpatialData (volume inferred). `milume.peek` names this argument `data`; `LandmarksWidget` names the same argument `adata`.
- **spatial_key** — `obsm` key for x/y coordinates (default `"spatial"`).
- **color** — `obs` column or `var_names` gene for point colour. When omitted, the first detected categorical column is used. Assign `w.color = key` later to recolour; unknown keys raise before anything changes.
- **genes** — Genes offered for view-only colouring. `None` (default) offers every `var_name` and sends each gene's values only when it is first coloured. A name or list restricts the catalog and preloads it when it packs under 64 MiB; larger lists load on demand too, with a warning.
- **table, image, shapes** — SpatialData-only overrides for the inferred table, multiscale image, and the shapes element of per-slice cell polygons (`cell_id` and `Z_um` columns) the Inspect cube meshes. `False` leaves one out.
- **channels** — SpatialData-only channel names to show on open (e.g. `["DAPI"]`). Unknown names raise `ValueError` listing the available names. For 3D images only one channel is allowed in this version.
- **contrast_limits** — SpatialData-only image contrast `(min, max)` for the Inspect cube. Defaults to the coarsest pyramid level's 1st percentile and max.

#### Notes

The widget keeps a reference to `adata` (no `obs.copy()`, no full-`X`
densify at construct). Chrome follows the notebook cell width; height starts
at 720px and is resizable. Marker radius comes from median nearest-neighbor
distance. Neighbourhood expand runs in the browser from coordinates; no
`obsp` graphs are required.

UI chrome (mode, neighbourhoods, raster controls) stays in the browser and
is not part of the notebook API. Raster bins and probe scores are built
client-side from the loaded gene, embedding, and category packs.

#### Returns

- **LandmarksWidget** — Widget handle `w`. Synced traitlets include `w.selections` and `w.landmarks`; join to `adata` with `get_obs_names(region)`.

#### Examples

```python
import milume
w = milume.peek(adata, color="cell_type")
w = milume.peek(sdata)  # table, image, cell polygons inferred
```

---

## Constructor parameters

#### Parameters

- **data, adata** — AnnData with spatial coordinates, or SpatialData (volume inferred). `milume.peek` names this argument `data`; `LandmarksWidget` names the same argument `adata`.
- **spatial_key** — `obsm` key for x/y coordinates (default `"spatial"`).
- **color** — `obs` column or `var_names` gene for point colour. When omitted, the first detected categorical column is used. Assign `w.color = key` later to recolour; unknown keys raise before anything changes.
- **genes** — Genes offered for view-only colouring. `None` (default) offers every `var_name` and sends each gene's values only when it is first coloured. A name or list restricts the catalog and preloads it when it packs under 64 MiB; larger lists load on demand too, with a warning.
- **table, image, shapes** — SpatialData-only overrides for the inferred table, multiscale image, and the shapes element of per-slice cell polygons (`cell_id` and `Z_um` columns) the Inspect cube meshes. `False` leaves one out.
- **channels** — SpatialData-only channel names to show on open (e.g. `["DAPI"]`). Unknown names raise `ValueError` listing the available names. For 3D images only one channel is allowed in this version.
- **contrast_limits** — SpatialData-only image contrast `(min, max)` for the Inspect cube. Defaults to the coarsest pyramid level's 1st percentile and max.

#### Notes

The widget keeps a reference to `adata` (no `obs.copy()`, no full-`X`
densify at construct). Chrome follows the notebook cell width; height starts
at 720px and is resizable. Marker radius comes from median nearest-neighbor
distance. Neighbourhood expand runs in the browser from coordinates; no
`obsp` graphs are required.

UI chrome (mode, neighbourhoods, raster controls) stays in the browser and
is not part of the notebook API. Raster bins and probe scores are built
client-side from the loaded gene, embedding, and category packs.

## Synced traitlets

Public traitlets from the registry (`milume.landmarks._PUBLIC_TRAITS`). Other synced fields are internal plumbing and may change without notice.

<div class="milume-api-traitlet-table" markdown="1">

| Name | Type | Default | Meaning |
| --- | --- | --- | --- |
| `color` | str | list[str] | `""` | obs column, gene, gene list (blend), or obsm embedding key; assign to recolour (raises ColorKeyError / ColorValueError). |
| `selections` | List[Dict] | `[]` | Drawn selections as dicts with id, name, geometry and point indices. |
| `landmarks` | List[Dict] | `[]` | Drawn landmarks (points, lines, splines, shapes) as dicts. |
| `selected_kind` | str | `""` | Kind of the focused item: selection, landmark, type, or empty. |
| `selected_index` | int | `-1` | Index of the focused item within its kind, or -1. |
| `selected_type_indices` | List[Int] | `[]` | Focused category label indices when selected_kind is type. |
| `inspect_cx` | float | `None` | Inspect window centre x in spatial units, or None before placement; set it to move the window and the open cube. |
| `inspect_cy` | float | `None` | Inspect window centre y in spatial units, or None before placement; set it to move the window and the open cube. |
| `inspect_size_um` | float | `300.0` | Inspect window side length in µm. |
| `inspect_open` | bool | `False` | Whether the Inspect cube is open; True opens it at inspect_cx/cy, or at the volume centre when no window is placed; False closes it and exits Inspect. ValueError without a 3D image. |
| `volume` | dict | — | The 3D image behind the Inspect cube (image path, cell polygons path and size, voxel size, origin, contrast); {} without one. Read it, don't set it. |
| `volume_cut` | List[Float] | `[]` | Cube cut box [x0, x1, y0, y1, z0, z1] in µm; the browser writes it on slider release, assign it to cut from Python. |
| `active_category` | str | `""` | Deprecated: derived from color; removed in 3.0. |
| `active_genes` | List[Unicode] | `[]` | Deprecated: derived from color; removed in 3.0. |

</div>

## GeoDataFrame interchange

Convert `w.landmarks` to a durable GeoPandas table (and back). Control vertices live in a JSON `vertices` column; `geometry` is a GIS proxy. The widget does not own SpatialData — assign `sdata['landmarks'] = gdf` in the notebook if needed.

Requires optional `geopandas` and `shapely`.

### `landmarks_to_geodataframe()`

```python
def landmarks_to_geodataframe(landmarks: list[dict] | None)
```

Convert widget landmark dicts to a GeoDataFrame.

#### Parameters

- **landmarks** — Landmark dicts from `w.landmarks`, or `None` / `[]` for an empty frame with contract columns (`id`, `type`, `vertices`, …).

#### Returns

- **geopandas.GeoDataFrame** — Proxy `geometry` plus JSON `vertices` as the round-trip source of truth. Callers assign into SpatialData themselves (e.g. `sdata["landmarks"] = gdf`).

#### Examples

```python
import milume
w = milume.peek(adata)
gdf = milume.landmarks_to_geodataframe(w.landmarks)
len(gdf)
```
0

### `geodataframe_to_landmarks()`

```python
def geodataframe_to_landmarks(gdf)
```

Convert a landmarks GeoDataFrame back to widget dicts.

#### Parameters

- **gdf** — GeoDataFrame produced by `landmarks_to_geodataframe`, or `None` / zero rows.

#### Returns

- **list[dict]** — Widget landmark dicts suitable for `w.landmarks = ...`. Empty input yields `[]`.

#### Examples

```python
import milume
w = milume.peek(adata)
w.landmarks = milume.geodataframe_to_landmarks(
```
...     milume.landmarks_to_geodataframe(w.landmarks)
... )

## Methods

Notebook helpers on the widget handle returned by `milume.peek`.

### `category_colors()`

```python
def category_colors(column: str | None = None) -> dict[str, str]
```

Label -> hex colour of a categorical column, as the map draws it.

Defaults to the active category. Use it to colour other views (plots,
the cube) the same way as the points.

### `clear_selections()`

```python
def clear_selections() -> None
```

Remove every selection from the widget.

### `clear_landmarks()`

```python
def clear_landmarks() -> None
```

Remove every landmark from the widget.

### `clear()`

```python
def clear() -> None
```

Remove all selections and landmarks.

### `select_type()`

```python
def select_type(index: int) -> None
```

Focus one category group in the active set (replaces a multi-select union).

The browser may set `selected_type_indices` to several groups; this
helper is the notebook path for single-group focus without fighting
front-end sync.

### `get_obs_names()`

```python
def get_obs_names(region: str) -> 'pd.Index'
```

`obs_names` of the cells in `region` as a `pd.Index`.

`region` is a selection id from `w.selections`, or `"focus"` for
the focused selection or category groups (empty when nothing is
focused). A hidden selection still returns its cells; hiding only
affects display. Raises `KeyError` for an unknown id. Write a column with
`adata.obs[key] = adata.obs_names.isin(w.get_obs_names(region))`.

### `set_points()`

```python
def set_points(x: Any, y: Any) -> None
```

Move the scatter points; colour stays on `color`.

### `set_expression()`

```python
def set_expression(expr: Any) -> None
```

Replace the gene catalog from a table (view-only).

Every column becomes a gene; it preloads under the eager size limit and
loads on demand above it, like `genes=`.

### `set_render_mode()`

```python
def set_render_mode(mode: str) -> None
```

Switch canvas between point scatter and spatial raster bins.

### `set_raster_basis()`

```python
def set_raster_basis(*, genes: str | None = None, embedding: str | None = None, composition: str | None = None) -> None
```

Select bin aggregation basis (genes / embedding / composition).

Bin feature matrices are built in the browser; this only updates traits.

### `clear_raster_query()`

```python
def clear_raster_query() -> None
```

Clear the pinned similarity query bin.
