"""Find what the Landmarks cube needs in a SpatialData: table, labels, 3D image, frame.

The table's ``spatialdata_attrs`` name the labels element it annotates and the
``obs`` column holding each cell's label id. The image is the 3D image in the
same coordinate system on the labels' grid (else the only 3D image there). The
frame comes from the element's transform to that coordinate system, so window
coordinates and ``obsm["spatial"]`` share units (µm for Pyxa / Meteor).
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass(frozen=True)
class VolumeSource:
    table_name: str
    image: str | None
    labels: str | None
    root: Path
    voxel_size_um: tuple[float, float, float]
    origin_um: tuple[float, float, float]
    shape_zyx: tuple[int, int, int]
    label_ids: np.ndarray | None


def _level0(element: Any):
    """Level-0 DataArray of a single- or multi-scale element."""
    if hasattr(element, "children") and "scale0" in element.children:
        return next(iter(element["scale0"].values()))
    return element


def _frame(element: Any, cs: str) -> tuple[tuple[float, ...], tuple[float, ...], tuple[int, ...]]:
    from spatialdata.transformations import get_transformation

    arr = _level0(element)
    shape = tuple(int(arr.sizes[a]) for a in ("z", "y", "x"))
    affine = get_transformation(element, to_coordinate_system=cs).to_affine_matrix(
        input_axes=("z", "y", "x"), output_axes=("z", "y", "x")
    )
    if not np.allclose(affine[:3, :3], np.diag(np.diag(affine[:3, :3]))):
        raise ValueError("the cube supports scale + translation transforms only")
    scale = tuple(float(v) for v in np.diag(affine[:3, :3]))
    origin = tuple(float(v) for v in affine[:3, 3])
    return scale, origin, shape


def _pick_table(sdata: Any, table: str | None) -> str:
    if table is not None:
        return table
    names = list(sdata.tables)
    if len(names) == 1:
        return names[0]

    def links_labels(name: str) -> bool:
        # ``region`` may also be a list of elements; only a single name links labels.
        region = sdata.tables[name].uns.get("spatialdata_attrs", {}).get("region")
        return isinstance(region, str) and region in sdata.labels

    linked = [n for n in names if links_labels(n)]
    if len(linked) == 1:
        return linked[0]
    raise ValueError(f"several tables {names}: pass table=<name>")


def resolve_volume(
    sdata: Any,
    *,
    table: str | None = None,
    image: str | bool | None = None,
    labels: str | bool | None = None,
) -> tuple[Any, VolumeSource | None]:
    """The table to plot and, when the cube is possible, its volume source.

    ``image`` / ``labels``: an element name, ``None`` to infer, or ``False`` to
    leave it out. Warns (and returns no source) when there is no 3D image or the
    SpatialData is not backed by a Zarr store on disk.
    """
    table_name = _pick_table(sdata, table)
    adata = sdata.tables[table_name]
    attrs = adata.uns.get("spatialdata_attrs", {})
    cs = "global"

    labels_name = None
    if labels is not False:
        region = labels if isinstance(labels, str) else attrs.get("region")
        if isinstance(region, str) and region in sdata.labels:
            labels_name = region
    if labels_name is not None:
        from spatialdata.transformations import get_transformation

        cs = next(iter(get_transformation(sdata.labels[labels_name], get_all=True)))

    image_name = None
    if image is not False:
        if isinstance(image, str):
            image_name = image
        else:
            images3d = [n for n, e in sdata.images.items() if "z" in _level0(e).dims]
            if labels_name is not None:
                target = _frame(sdata.labels[labels_name], cs)
                aligned = [n for n in images3d if _frame(sdata.images[n], cs) == target]
                image_name = (aligned or images3d or [None])[0]
            elif len(images3d) == 1:
                image_name = images3d[0]
    if image_name is None:
        warnings.warn("no 3D image in this SpatialData: Landmarks has no cube", UserWarning, stacklevel=2)
        return adata, None
    if getattr(sdata, "path", None) is None:
        warnings.warn("SpatialData is not backed by a Zarr store on disk: no cube", UserWarning, stacklevel=2)
        return adata, None

    voxel, origin, shape = _frame(sdata.images[image_name], cs)
    if labels_name is not None and _frame(sdata.labels[labels_name], cs) != (voxel, origin, shape):
        warnings.warn(
            f"labels {labels_name!r} are on another grid than {image_name!r}: cube shows the image only",
            UserWarning,
            stacklevel=2,
        )
        labels_name = None
    label_ids = None
    if labels_name is not None and attrs.get("instance_key") in adata.obs:
        label_ids = adata.obs[attrs["instance_key"]].to_numpy().astype(np.int32)
    return adata, VolumeSource(table_name, image_name, labels_name, Path(sdata.path), voxel, origin, shape, label_ids)
