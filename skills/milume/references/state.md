# Widget state reference (milume 1.2.0)

Read the live object when in doubt: `widget.keys` lists synced traits, and
`help(milume.LandmarksWidget)` has the notebook API.

## Synced both ways, worth knowing

| Trait | Type | Notes |
|---|---|---|
| `landmarks` | list[dict] | Durable annotations. Browser edits and Python writes both sync. |
| `selections` | list[dict] | Regions for analysis. Not persisted by milume. |
| `selected_kind`, `selected_index` | str, int | `"landmark"` / `"selection"` / `""`; `-1` when none. |
| `inspect_cx`, `inspect_cy` | float or None | Inspect window centre in µm. `None` until a window is placed. |
| `inspect_size_um` | float | Fixed 300 µm; the browser writes it, Python only reads. |
| `mode` | str | The armed tool. Seen: `select`, `node`, `lasso`, `line`, `spline`, `shape`. Read it from the live widget before assuming others. |
| `active_category`, `active_genes` | str, list[str] | What colours the map. |
| `volume`, `volume_cut`, `volume_label_ids` | dict, list, str | Present only for SpatialData with a 3D image. |
| `x_bounds`, `y_bounds` | tuple | Data extent in µm (set at construction). |

The point, gene and embedding packs (`points_data`, `gene_*`, `raster_*`,
`embedding_*`) are base64 payloads. Do not print them.

## Landmark dict

```python
{"id": "front", "type": "spline",           # point | line | spline | shape
 "vertices": [[x, y], ...],                 # control points, µm; shapes close implicitly
 "tension": 0, "buffer_width": 0, "buffer_side": "both",   # buffer: line/spline band, µm
 "line_style": "solid", "color": "#00e5ff"}
```

A point has one vertex, a line two or more, a spline two or more, a shape three
or more. Ids are strings and unique. The browser names new ones `landmark 1`.
`landmarks_to_geodataframe` yields `id, type, vertices, tension, buffer_width,
buffer_side, radius, geometry`.

## Selection dict

```python
{"id": "tumour", "type": "polygon", "vertices": [[x, y], ...]}            # or "lasso"
{"id": "box", "type": "rectangle", "cx": 0.0, "cy": 0.0, "width": 200.0, "height": 200.0, "angle": 0.0}
{"id": "disc", "type": "ellipse", "cx": 0.0, "cy": 0.0, "rx": 80.0, "ry": 50.0, "angle": 0.0}
```

Browser-made selections arrive as `{"type": "points", "point_indices": [...],
"neighborhood": "off", "neighborhood_radius": 0, "neighborhood_k": 12}`, named
`"<top category> · <count>"`. Inspect selections have `"type": "inspect"` plus a
`window` dict (centre, size, cut) that restores the cube.

Python-authored geometry selections resolve by point-in-polygon at
`get_obs_names` time. Index-based ones resolve exactly as stored.
