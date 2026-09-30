"""Landmarks inspect drives VolumeCube; Python reacts to window and slice state.

Uses the IDR Blin nuclear-segmentation OME-Zarr (idr0062): LaminB1 + DAPI,
271×275×236 voxels. Spatial points are a random XY overlay in the same voxel
frame (this IDR release has no matching cell table).

A mid-Z slab (64 planes) keeps GPU use reasonable alongside Landmarks. The cube
shows the 100-voxel inspect window in XY; Z is controlled by the slider below.
"""

import marimo

__generated_with = "0.24.0"
app = marimo.App(width="full")


@app.cell
def _():
    import anndata as ad
    import marimo as mo
    import numpy as np

    from milume import LandmarksWidget, VolumeCubeWidget
    from milume.volume_cube import (
        BLIN_IDR_IMAGE_URL,
        BLIN_SHAPE_ZYX,
        cells_in_inspect_window,
    )

    return (
        BLIN_IDR_IMAGE_URL,
        BLIN_SHAPE_ZYX,
        LandmarksWidget,
        VolumeCubeWidget,
        ad,
        cells_in_inspect_window,
        mo,
        np,
    )


@app.cell
def _(BLIN_IDR_IMAGE_URL, BLIN_SHAPE_ZYX, VolumeCubeWidget, ad, np):
    cube = VolumeCubeWidget.from_url(
        BLIN_IDR_IMAGE_URL,
        labels_url="",
        shape_zyx=BLIN_SHAPE_ZYX,
    )
    depth, height, width = BLIN_SHAPE_ZYX

    rng = np.random.default_rng(0)
    xy = np.column_stack(
        [
            rng.uniform(20, width - 20, 600),
            rng.uniform(20, height - 20, 600),
        ]
    )
    adata = ad.AnnData(np.zeros((xy.shape[0], 1), dtype=np.float32))
    adata.obsm["spatial"] = xy
    adata.obs["region"] = rng.choice(["a", "b", "c"], xy.shape[0])
    return adata, cube, depth


@app.cell(hide_code=True)
def _(mo):
    mo.md("""
    # Volume cube + landmarks

    **Inspect** on the tissue map drives the detail cube window. The cube shows
    that 100-voxel square in XY; adjust Z with the slider below.
    """)
    return


@app.cell
def _(LandmarksWidget, adata, mo):
    landmarks = mo.ui.anywidget(LandmarksWidget(adata, color="region"))
    return (landmarks,)


@app.cell
def _(cube, depth, mo):
    z_slice = mo.ui.range_slider(
        0,
        depth,
        value=[int(cube.slice_z_min), int(cube.slice_z_max)],
        step=1,
        label="Z slice (voxel)",
        show_value=True,
    )
    return (z_slice,)


@app.cell
def _(cube, mo):
    cube_ui = mo.ui.anywidget(cube)
    return (cube_ui,)


@app.cell
def _(adata, cells_in_inspect_window, cube, cube_ui, landmarks, mo, z_slice):
    cube.slice_z_min = float(z_slice.value[0])
    cube.slice_z_max = float(z_slice.value[1])
    if landmarks.inspect_cx is not None:
        cube.window_cx = float(landmarks.inspect_cx)
        cube.window_cy = float(landmarks.inspect_cy)

    if landmarks.inspect_cx is None:
        analysis = mo.md(
            "Choose **Inspect** on the tissue map, then click to drive the "
            "detail cube and run analysis here."
        )
    else:
        mask = cells_in_inspect_window(
            adata.obsm["spatial"],
            landmarks.inspect_cx,
            landmarks.inspect_cy,
            landmarks.inspect_size_um,
        )
        n_points = int(mask.sum())
        analysis = mo.md(
            f"**{n_points}** spatial points in the {landmarks.inspect_size_um:g}-voxel "
            f"inspect window at ({landmarks.inspect_cx:.0f}, {landmarks.inspect_cy:.0f}) "
            f"· cube Z {cube.slice_z_min:.0f}–{cube.slice_z_max:.0f}"
        )

    mo.vstack(
        [
            mo.hstack([landmarks, cube_ui], widths=[1, 1]),
            z_slice,
            analysis,
        ],
    )
    return


if __name__ == "__main__":
    app.run()
