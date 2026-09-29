# Roadmap

Not a viewer. A thinking surface for spatial biology.

Notebook-native widgets tie AnnData-backed analysis to interactive tissue exploration.
See [`frontend/PRODUCT.md`](frontend/PRODUCT.md) for positioning and shipped capabilities.

## First release

- **LandmarksWidget**: selections, landmarks and neighborhoods on tissue
  coordinates, colored by category, gene or embedding. From a SpatialData, it
  adds Inspect: a full-resolution 3D cube of the tissue under a window, with
  saved inspect selections.
- **VolumeCubeWidget**: the same cube as a standalone widget for an OME-Zarr image.
- **Measures**: `distances`, `along_positions` and `composition` against
  landmarks (in XY, with optional z bins), `enrichment` and `nearest_distances`.

## Under consideration

- A documentation site (draft [PR #32](https://github.com/ckmah/spatial-rx/pull/32)).
- Jupyter parity with the marimo-first development loop.
- Mesh-based 3D rendering (Polyrender, parked in draft
  [PR #28](https://github.com/ckmah/spatial-rx/pull/28); the Viv cube is the 3D path for now).
