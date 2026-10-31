"""Synthetic AnnData for widget tests (no dataset downloads)."""

from __future__ import annotations

import anndata as ad
import numpy as np
import pandas as pd


def adata_xy(
    x,
    y,
    *,
    color=None,
    color_key="label",
    genes: dict[str, list[float]] | None = None,
    names: list[str] | None = None,
    uns: dict | None = None,
):
    """Build a tiny AnnData with ``obsm['spatial']``."""
    n = len(x)
    index = names if names is not None else [f"c{i}" for i in range(n)]
    obs = pd.DataFrame(index=index)
    if color is not None:
        obs[color_key] = color

    if genes:
        gene_names = list(genes)
        X = np.column_stack([np.asarray(genes[g], dtype=np.float32) for g in gene_names])
        var = pd.DataFrame(index=gene_names)
    else:
        X = np.zeros((n, 1), dtype=np.float32)
        var = pd.DataFrame(index=["g0"])

    adata = ad.AnnData(X=X, obs=obs, var=var)
    adata.obsm["spatial"] = np.column_stack(
        [np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64)]
    )
    if uns:
        adata.uns.update(uns)
    return adata


def toy_spatialdata(dest):
    """On-disk SpatialData on the toy volume grid (1 µm voxels): image, labels, the
    cells' per-plane polygons (a circle per plane through each blob), table."""
    import anndata as ad
    import geopandas as gpd
    import numpy as np
    import pandas as pd
    import spatialdata as sd
    from shapely.geometry import Polygon
    from spatialdata.models import Image3DModel, Labels3DModel, ShapesModel, TableModel
    from spatialdata.transformations import Identity

    from milume.volume_cube import toy_volumes

    image, labels = toy_volumes()
    ids = np.unique(labels)
    ids = ids[ids > 0]
    centroids = []
    for i in ids:
        zz, yy, xx = np.nonzero(labels == i)
        centroids.append([xx.mean(), yy.mean(), zz.mean()])
    obs = pd.DataFrame(
        {
            "cell_type": pd.Categorical([f"type{i % 2}" for i in ids]),
            "cell_id": ids.astype(int),
            "region": pd.Categorical(["cells"] * len(ids)),
        },
        index=[f"cell{i}" for i in ids],
    )
    rows = []
    for i in ids:
        zz, yy, xx = np.nonzero(labels == i)
        cz, cy, cx = zz.mean(), yy.mean() + 0.5, xx.mean() + 0.5
        radius = (np.ptp(xx) + 1) / 2
        for z in np.unique(zz):
            r = np.sqrt(max(radius**2 - (z - cz) ** 2, 0.25))
            t = np.linspace(0, 2 * np.pi, 32, endpoint=False)
            ring = np.c_[cx + r * np.cos(t), cy + r * np.sin(t)]
            rows.append({"cell_id": f"cell{i}", "Z_um": z + 0.5, "geometry": Polygon(ring)})
    polygons = ShapesModel.parse(gpd.GeoDataFrame(rows), transformations={"global": Identity()})
    table = ad.AnnData(np.ones((len(ids), 1), dtype=np.float32), obs=obs)
    table.obsm["spatial"] = np.asarray(centroids, dtype=float)
    sdata = sd.SpatialData(
        images={
            "mosaic": Image3DModel.parse(
                image[None],
                dims=("c", "z", "y", "x"),
                transformations={"global": Identity()},
                scale_factors=[2, 2],
            )
        },
        labels={
            "cells": Labels3DModel.parse(
                labels.astype(np.uint32),
                dims=("z", "y", "x"),
                transformations={"global": Identity()},
                scale_factors=[2, 2],
            )
        },
        shapes={"cell_polygons": polygons},
        tables={"table": TableModel.parse(table, region="cells", region_key="region", instance_key="cell_id")},
    )
    sdata.write(dest)
    return sd.read_zarr(dest)


def issue122_2d_multichannel_spatialdata(dest):
    """Small 2D multichannel SpatialData for #122: cells on DAPI blobs, PanCK tint, µm Scale."""
    import anndata as ad
    import numpy as np
    import pandas as pd
    import spatialdata as sd
    from spatialdata.models import Image3DModel, TableModel
    from spatialdata.transformations import Scale

    pixel_um = 0.5
    sigma = 4.5

    peaks_px = [(22, 28), (48, 62), (48, 28), (20, 58)]
    extra = [(12 + i * 7, 10 + (i % 5) * 9) for i in range(20)]
    centers_px = peaks_px + extra
    pad = 14
    xs = [x for _, x in centers_px]
    ys = [y for y, _ in centers_px]
    w = int(max(xs) + pad)
    h = int(max(ys) + pad)
    yy, xx = np.mgrid[0:h, 0:w]

    def blob(cx, cy, amp):
        return amp * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sigma**2))

    ch_dapi = np.zeros((h, w), dtype=np.float32)
    ch_panck = np.zeros((h, w), dtype=np.float32)
    ch_cd45 = np.zeros((h, w), dtype=np.float32)
    ch_ki67 = np.zeros((h, w), dtype=np.float32)
    panck_cells = {0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22}
    for i, (cy, cx) in enumerate(centers_px):
        ch_dapi += blob(cx, cy, 220)
        if i in panck_cells:
            ch_panck += blob(cx, cy, 200)
        elif i % 3 == 1:
            ch_cd45 += blob(cx, cy, 170)
        elif i % 5 == 0:
            ch_ki67 += blob(cx, cy, 160)

    ch_dapi = np.clip(ch_dapi, 0, 255).astype(np.uint8)
    ch_panck = np.clip(ch_panck, 0, 255).astype(np.uint8)
    ch_cd45 = np.clip(ch_cd45, 0, 255).astype(np.uint8)
    ch_ki67 = np.clip(ch_ki67, 0, 255).astype(np.uint8)
    ch_dummy = np.zeros((h, w), dtype=np.uint8)
    values = np.stack([ch_dapi, ch_panck, ch_cd45, ch_ki67, ch_dummy], axis=0)
    values = values[:, np.newaxis, :, :]

    centers_um = np.array([[x * pixel_um, y * pixel_um] for y, x in centers_px], dtype=np.float64)

    n = len(centers_um)
    obs = pd.DataFrame(
        {
            "cell_type": pd.Categorical([f"type{i % 2}" for i in range(n)]),
            "cell_id": np.arange(1, n + 1, dtype=int),
        },
        index=[f"cell{i}" for i in range(n)],
    )
    table = ad.AnnData(np.ones((n, 1), dtype=np.float32), obs=obs)
    table.obsm["spatial"] = centers_um

    image = Image3DModel.parse(
        values,
        dims=("c", "z", "y", "x"),
        c_coords=pd.Index(["DAPI", "PanCK", "CD45", "Ki67", "dummy"]),
        transformations={"global": Scale([1.0, pixel_um, pixel_um], axes=("z", "y", "x"))},
        scale_factors=[1],
    )
    sdata = sd.SpatialData(
        images={"mosaic": image},
        tables={"table": TableModel.parse(table)},
    )
    sdata.write(dest)
    return sd.read_zarr(dest)

