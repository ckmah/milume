"""Minimal in-memory SpatialData for edge cases not covered by real #103 fixtures."""

from __future__ import annotations

import numpy as np
import pandas as pd


def xenium_like_spatialdata():
    """2D Xenium-shaped SpatialData: morphology image, cell_labels, one table."""
    import anndata as ad
    import spatialdata as sd
    from spatialdata.models import Image2DModel, Labels2DModel, TableModel
    from spatialdata.transformations import Identity

    n = 12
    rng = np.random.default_rng(0)
    xy = rng.uniform(100, 900, size=(n, 2))
    obs = pd.DataFrame(
        {
            "cell_labels": np.arange(1, n + 1, dtype=np.int64),
            "region": pd.Categorical(["cell_labels"] * n),
        },
        index=[f"cell{i}" for i in range(n)],
    )
    table = ad.AnnData(np.ones((n, 2), dtype=np.float32), obs=obs)
    table.var_names = ["GeneA", "GeneB"]
    table.obsm["spatial"] = xy
    image = rng.integers(0, 255, size=(3, 64, 64), dtype=np.uint8)
    labels = np.zeros((64, 64), dtype=np.int32)
    for i, (x, y) in enumerate(xy):
        xi, yi = int(x / 15) % 60 + 2, int(y / 15) % 60 + 2
        labels[yi : yi + 3, xi : xi + 3] = i + 1

    return sd.SpatialData(
        images={
            "morphology_focus": Image2DModel.parse(
                image,
                dims=("c", "y", "x"),
                transformations={"global": Identity()},
            )
        },
        labels={
            "cell_labels": Labels2DModel.parse(
                labels,
                dims=("y", "x"),
                transformations={"global": Identity()},
            )
        },
        tables={
            "table": TableModel.parse(
                table,
                region="cell_labels",
                region_key="region",
                instance_key="cell_labels",
            )
        },
    )
