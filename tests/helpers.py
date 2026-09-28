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
    """On-disk SpatialData on the toy volume grid: image, labels, table (1 µm voxels)."""
    import anndata as ad
    import numpy as np
    import pandas as pd
    import spatialdata as sd
    from spatialdata.models import Image3DModel, Labels3DModel, TableModel
    from spatialdata.transformations import Identity

    from spatial_rx.volume_cube import toy_volumes

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
    table = ad.AnnData(np.ones((len(ids), 1), dtype=np.float32), obs=obs)
    table.obsm["spatial"] = np.asarray(centroids, dtype=float)
    sdata = sd.SpatialData(
        images={
            "mosaic": Image3DModel.parse(
                image[None], dims=("c", "z", "y", "x"), transformations={"global": Identity()}
            )
        },
        labels={
            "cells": Labels3DModel.parse(
                labels.astype(np.uint32), dims=("z", "y", "x"), transformations={"global": Identity()}
            )
        },
        tables={"table": TableModel.parse(table, region="cells", region_key="region", instance_key="cell_id")},
    )
    sdata.write(dest)
    return sd.read_zarr(dest)

