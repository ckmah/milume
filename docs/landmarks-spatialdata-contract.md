# Landmarks ↔ GeoDataFrame contract (M1)

Binding contract for durable landmark annotations. Implements
[GitHub #26](https://github.com/ckmah/milume/issues/26) / M1.1.
Vocabulary: [`CONTEXT.md`](../CONTEXT.md).

## Scope

| Object | Durable as GeoDataFrame? | Notes |
| --- | --- | --- |
| **Landmark** | Yes | Source of truth for annotations after commit |
| **Selection** | No (M1) | Analysis region; hits via `obs_names` |

Do not hook GeoDataFrame export to the `selections` traitlet.

The widget does **not** hold a SpatialData object. Notebooks convert
`w.landmarks` ↔ GeoDataFrame with pure helpers and assign into SpatialData
themselves if desired.

## Coordinate system

- Landmark coordinates are **data / tissue coordinates**, the same space as
  `AnnData.obsm["spatial"]` (typically µm or pixel units of the scatter).
- When placing the GeoDataFrame into SpatialData, use the **same coordinate
  system** as the table / points used to build the widget scatter. Do not invent
  a second CRS for landmarks.
- With `LandmarksWidget(sdata)` that coordinate system is `w.coordinate_system`
  (chosen by `coordinate_system=`, else the one holding most of the table's
  cells). Declare it when you place the GeoDataFrame, so the element lines up
  with the cells in every other coordinate system the table's elements share:

  ```python
  from spatialdata.models import ShapesModel
  from spatialdata.transformations import Identity

  sdata["landmarks"] = ShapesModel.parse(gdf, transformations={w.coordinate_system: Identity()})
  ```
- Y-up vs image Y-down follows whatever the widget already uses for
  `obsm["spatial"]` (no silent flip on write/read).

## Public API

```python
from milume import landmarks_to_geodataframe, geodataframe_to_landmarks

gdf = landmarks_to_geodataframe(w.landmarks)       # may be empty
w.landmarks = geodataframe_to_landmarks(gdf)       # [] if empty

# Optional — notebook-owned SpatialData:
sdata["landmarks"] = gdf
```

Default element name when storing in SpatialData: `landmarks`.

## Required columns (properties)

| Column | Type | Required | Role |
| --- | --- | --- | --- |
| geometry | GeoPandas geometry | yes | See geometry mapping |
| `id` | string | yes | Stable landmark id (matches widget `landmarks[].id`) |
| `type` | string | yes | One of `point`, `line`, `spline`, `shape` |
| `tension` | float | no | Cardinal tension for `spline` / `shape` (default `0`) |
| `buffer_width` | float | no | Buffer width in data units (default `0`) |
| `buffer_side` | string | no | `left` \| `both` \| `right` (default `both`) |

Optional UI-only fields (`hidden`, colors) may be omitted from the durable
table; round-trip of **id / type / geometry / tension / buffer_*** is
required for M1.

## Geometry mapping (widget → GeoDataFrame)

Widget landmarks store **control** geometry in `vertices` (list of `[x, y]` in
data coords). That JSON column is the round-trip source of truth.

The `geometry` column is a GIS-facing approximation:

| `type` | GeoPandas geometry | Geometry rule | Control vertices |
| --- | --- | --- | --- |
| `point` | `Point` (+ `radius` column, default `1.0`) | First vertex | JSON `vertices` |
| `line` | `LineString` | Polyline through `vertices` (not densified) | JSON `vertices` |
| `spline` | `LineString` | Cardinal sample of control `vertices` (`tension`; same densify as measure) | JSON `vertices` (controls only) |
| `shape` | `Polygon` | Closed ring from control `vertices` | JSON `vertices` (+ `tension` column) |

On read: rebuild widget dicts from `id`, `type`, JSON `vertices`, and optional
`tension` / `buffer_width` / `buffer_side`. **Never** treat densified spline
`LineString` coordinates as new control points when `vertices` is present — that
would re-sample on every export and degenerate the curve.

If `vertices` is missing: `Point` → point; `Polygon` → shape ring; `LineString`
→ polyline **`line`** (even if `type` was `spline`), so a later export does not
densify again.

Note: SpatialData `ShapesModel` historically accepts `Point` / `Polygon` /
`MultiPolygon` only. Callers placing this GeoDataFrame into SpatialData should
use an element type that accepts `LineString`, or keep the table as a standalone
GeoDataFrame.

## Round-trip invariants

Given widget landmarks `L`:

1. `gdf = landmarks_to_geodataframe(L)`.
2. `L' = geodataframe_to_landmarks(gdf)`.
3. For each landmark, equal: `id`, `type`, control
   `vertices` (float-close), and present optional buffer/tension fields.
4. Repeating steps 1–2 does not change control `vertices` (no densify-on-import).

Empty `landmarks` ↔ empty GeoDataFrame (same columns, zero rows). Empty /
missing input to `geodataframe_to_landmarks` yields `[]`.

## Non-goals (this contract)

- Writing **selections** into a GeoDataFrame / SpatialData
- Widget-owned SpatialData attach / auto-save
- Neighborhood edges / type-neighborhood rows as shapes
- Image, labels, or molecule layers
- Standalone app packaging

## Implementation notes (for M1.2)

- Pure functions only: `landmarks_to_geodataframe` / `geodataframe_to_landmarks`.
- Prove the contract with pytest round-trips (TDD).
- Depend on GeoPandas + shapely only where the IO path needs it (optional import
  pattern matching the rest of the package).
