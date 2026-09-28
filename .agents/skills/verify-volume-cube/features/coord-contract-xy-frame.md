# coord-contract-xy-frame

Landmarks ``obsm["spatial"]`` XY and VolumeCube ``window_cx`` / ``window_cy`` /
``slice_*`` traits share the same coordinate frame. ``voxel_size_um`` /
``origin_um`` map it onto level-0 voxels; the defaults make **one unit = one
voxel** (toy: 256×256; Blin: 271×275×236). ``VolumeCubeWidget.from_ome_zarr``
reads them from NGFF metadata, so a Meteor mosaic in stage µm matches Pyxa cell
coordinates (``colon_a2.py`` in the sibling ``pyxa_scverse_demo`` repo).

**Spec:** `tests/test_volume_cube.py` — `test_coord_contract_landmarks_cube_xy`, `test_from_ome_zarr_frames_cube_in_store_microns`

## Sub-features

- ``cells_in_inspect_window`` counts points in the 100-unit inspect square
- Cube slice maxima match known volume shape from ``from_url(shape_zyx=...)``
- Inspect center copied to ``window_cx`` / ``window_cy`` stays inside XY bounds (manual two-widget linking, as ``demos/volume-cube.py`` shows)

## How to get to it (user POV)

For the standalone widget: in ``demos/volume-cube.py``, synthetic cell
coordinates are drawn in the same XY frame as the cube. Click **Inspect** on
tissue — the analysis cell reports how many cells fall inside the inspect
window at the synced window center. Landmarks' own inline cube (see the
[verify-landmarks `inspect-cube` map entry](../../verify-landmarks/features/inspect-cube.md))
shares the same coordinate contract without a second widget or a copy step.

## Driving it with Playwright

Not Playwright-driven today — the notebook-link harness that proved
`window_cx`/`window_cy` parity against a second `VolumeCubeWidget` is gone
along with the manual-linking product path it tested. This contract is
proved by pytest (below) plus the inline cube's own Playwright coverage in
[`inspect-cube`](../../verify-landmarks/features/inspect-cube.md), which
exercises the same frame without a second widget.

**Proof**

- Functional: pytest coord contract (`test_coord_contract_landmarks_cube_xy`, `test_from_ome_zarr_frames_cube_in_store_microns`).
- Visual: no dedicated anchor.

## Gotchas

- ``inspect_size_um`` / ``window_size_um`` label says µm but demo treats units as voxels.
- Blin IDR URL is not fetched in CI; pytest uses toy extents offline.
