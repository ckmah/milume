# Transect position sketch

This is a prototype sketch for issue 471. It is not on `milume.__all__`. The distance below is the harness mock `mock-straight-line`, a Euclidean projection onto the polyline through the ordered landmarks. A cell-graph geodesic would replace that function and keep the same series.

```python
# w is a LandmarksWidget. landmark ids match the ordered stops.
w.transects.add(["harness-point", "harness-line"], id="path-1")

t = w.get_transect_position("path-1")
# pandas.Series, index aligned to adata.obs_names.
# value is segment index + fraction along that segment.
# path-1 stop 0 -> stop 1 is t in [0, 1], stop 1 -> stop 2 is t in [1, 2].

side = w.get_transect_offset("path-1")
# pandas.Series, signed perpendicular distance in µm.
# Positive is left of the direction of travel.

adata.obs["transect_t"] = t
adata.obs["transect_side"] = side
```

`w.transects` is the ordered list of those paths. Each entry stores the landmark ids in order and the method name. Reordering the ids and calling `get_transect_position` again is the whole update. The three harness options are different ways to build that ordered id list and to read `t` back on the map.
