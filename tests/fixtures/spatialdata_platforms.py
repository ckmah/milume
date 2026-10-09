"""Tiny Xenium- and CosMx-shaped fixtures for platform tests (CI-fast)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


def write_cosmx_tiny_flatfiles(root: Path, *, dataset_id: str = "milume_tiny") -> Path:
    """CosMx flat-file tree readable by ``spatialdata_io.cosmx()``."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    (root / "CellComposite").mkdir(exist_ok=True)
    (root / "CellLabels").mkdir(exist_ok=True)

    rows = []
    for fov in (1, 2):
        for cid in range(1, 4):
            rows.append(
                {
                    "cell_ID": cid,
                    "fov": fov,
                    "CenterX_global_px": fov * 5000 + cid * 100,
                    "CenterY_global_px": cid * 200,
                    "CenterX_local_px": cid * 10,
                    "CenterY_local_px": cid * 20,
                }
            )
    meta = pd.DataFrame(rows)
    meta.to_csv(root / f"{dataset_id}_metadata_file.csv", index=False)

    counts = meta[["cell_ID", "fov"]].copy()
    counts["GeneA"] = 1
    counts["GeneB"] = 2
    counts.to_csv(root / f"{dataset_id}_exprMat_file.csv", index=False)

    pd.DataFrame({"fov": [1, 2], "x_global_px": [0, 5000], "y_global_px": [0, 0]}).to_csv(
        root / f"{dataset_id}_fov_positions_file.csv", index=False
    )
    pd.DataFrame(
        {
            "fov": [1, 1],
            "cell_ID": [1, 2],
            "x_local_px": [1.0, 2.0],
            "y_local_px": [3.0, 4.0],
            "target": ["GeneA", "GeneB"],
        }
    ).to_csv(root / f"{dataset_id}_tx_file.csv", index=False)

    try:
        from PIL import Image
    except ImportError:  # pragma: no cover
        import imageio.v3 as iio

        for fov in (1, 2):
            rgb = np.zeros((32, 32, 3), dtype=np.uint8)
            rgb[10:20, 10:20, 0] = 200
            iio.imwrite(root / "CellComposite" / f"{dataset_id}_F{fov}.tif", rgb)
            lab = np.zeros((32, 32), dtype=np.uint16)
            lab[10:20, 10:20] = 1
            iio.imwrite(root / "CellLabels" / f"{dataset_id}_F{fov}.tif", lab)
    else:
        for fov in (1, 2):
            rgb = np.zeros((32, 32, 3), dtype=np.uint8)
            rgb[10:20, 10:20, 0] = 200
            Image.fromarray(rgb).save(root / "CellComposite" / f"{dataset_id}_F{fov}.tif")
            lab = np.zeros((32, 32), dtype=np.uint16)
            lab[10:20, 10:20] = 1
            Image.fromarray(lab).save(root / "CellLabels" / f"{dataset_id}_F{fov}.tif")

    return root


def xenium_like_spatialdata():
    """In-memory SpatialData matching tiny Xenium: 2D image, 2D labels, one table."""
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


def xenium_like_with_string_instance_ids():
    """Xenium-style table where ``instance_key`` holds string ids (not int32-safe)."""
    sdata = xenium_like_spatialdata()
    table = sdata.tables["table"]
    table.obs["cell_id"] = [f"aaabbaka-{i}" for i in range(table.n_obs)]
    table.obs["region"] = pd.Categorical(["cell_labels"] * table.n_obs)
    table.uns["spatialdata_attrs"] = {
        **table.uns.get("spatialdata_attrs", {}),
        "instance_key": "cell_id",
    }
    return sdata
