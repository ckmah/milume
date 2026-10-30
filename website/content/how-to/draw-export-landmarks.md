# Draw and export landmarks

Draw landmarks on the map, export them as vector data, and load edits back into the widget.

## Goal

Move landmarks between milume and GeoPandas (or any tool that reads GeoJSON/Shapefile via GeoDataFrame).

## Steps

1. Open milume on spatial data (ileum demo):

```python
import milume
import milume.datasets as mds

adata = mds.ileum_merfish_xu2026()
w = milume.peek(adata, color="cell_type")
w
```

2. Draw or edit landmarks in the browser ([Landmarks](../reference/ui/landmarks.md)). Each edit updates `w.landmarks`.

3. Convert the synced list to a GeoDataFrame (`geopandas` required):

```python
import geopandas as gpd
from milume import landmarks_to_geodataframe, geodataframe_to_landmarks

gdf = landmarks_to_geodataframe(w.landmarks)
gdf.to_file("landmarks.geojson", driver="GeoJSON")
```

4. Edit `gdf` offline, then push it back:

```python
gdf = gpd.read_file("landmarks.geojson")
w.landmarks = geodataframe_to_landmarks(gdf)
```

5. Run measure helpers against the same `adata` and exported geometry when you need distances or composition ([Measure API](../reference/api/measure.md)).

## Result

`landmarks.geojson` (or your chosen path) matches what you drew; assigning back to `w.landmarks` updates the map.

Column semantics and CRS notes are in [GeoDataFrame interchange](../reference/api/landmarks.md#geodataframe-interchange).
