# Draw and export landmarks

`w.landmarks` updates on every edit. Convert to and from a GeoDataFrame (needs `geopandas`):

```python
from milume import landmarks_to_geodataframe, geodataframe_to_landmarks
gdf = landmarks_to_geodataframe(w.landmarks)
w.landmarks = geodataframe_to_landmarks(gdf)
```

On-canvas landmark tools are in [Landmarks](../reference/ui/landmarks.md). See [GeoDataFrame interchange](../reference/api/landmarks.md#geodataframe-interchange) in the API reference.
