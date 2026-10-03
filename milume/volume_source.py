"""Find what the Landmarks cube needs in a SpatialData: labels, 3D image, frame.

The table (see ``table_source``) names the labels element it annotates and the
``obs`` column holding each cell's label id. The image is the 3D image in the
same coordinate system on the labels' grid (else the only 3D image there). The
frame comes from the element's transform to that coordinate system, so window
coordinates and ``obsm["spatial"]`` share units (µm for Pyxa / Meteor).

Most SpatialData are 2D: then there is simply no cube, and nothing to warn about.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .table_source import TableSelection, select_table


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
    if not {"z", "y", "x"} <= set(arr.dims):
        raise ValueError("not a 3D element")
    shape = tuple(int(arr.sizes[a]) for a in ("z", "y", "x"))
    try:
        affine = get_transformation(element, to_coordinate_system=cs).to_affine_matrix(
            input_axes=("z", "y", "x"), output_axes=("z", "y", "x")
        )
    except (KeyError, ValueError) as err:
        raise ValueError(f"no scale + translation transform to {cs!r}") from err
    if not np.allclose(affine[:3, :3], np.diag(np.diag(affine[:3, :3]))):
        raise ValueError("the cube supports scale + translation transforms only")
    scale = tuple(float(v) for v in np.diag(affine[:3, :3]))
    origin = tuple(float(v) for v in affine[:3, 3])
    return scale, origin, shape


def _frame_or_none(element: Any, cs: str):
    try:
        return _frame(element, cs)
    except ValueError:
        return None


def volume_for(
    sdata: Any,
    sel: TableSelection,
    *,
    rows: np.ndarray | None = None,
    image: str | bool | None = None,
    labels: str | bool | None = None,
) -> VolumeSource | None:
    """The cube's volume source for the plotted ``rows`` of ``sel``, or ``None`` for no cube.

    ``image`` / ``labels``: an element name, ``None`` to infer, or ``False`` to
    leave it out. Warns when a 3D image exists but cannot be served (the
    SpatialData is not backed by a Zarr store, or its transform is not scale +
    translation).
    """
    adata = sel.adata
    cs = sel.coordinate_system or "global"
    kept = sel.keep if rows is None else np.isin(np.arange(adata.n_obs), rows)

    labels_name = None
    if labels is not False and (isinstance(labels, str) or sel.row_region is not None):
        regions = [labels] if isinstance(labels, str) else list(dict.fromkeys(sel.row_region[kept].tolist()))
        if len(regions) == 1 and regions[0] in sdata.labels:
            labels_name = regions[0]

    image_name = None
    if image is not False:
        if isinstance(image, str):
            if image not in sdata.images:
                raise ValueError(f"no image {image!r}; images: {list(sdata.images)}")
            image_name = image
        else:
            images3d = [n for n, e in sdata.images.items() if "z" in _level0(e).dims]
            if labels_name is not None:
                target = _frame_or_none(sdata.labels[labels_name], cs)
                aligned = [n for n in images3d if target is not None and _frame_or_none(sdata.images[n], cs) == target]
                image_name = (aligned or images3d or [None])[0]
            elif len(images3d) == 1:
                image_name = images3d[0]
    if image_name is None:
        return None
    if getattr(sdata, "path", None) is None:
        warnings.warn("SpatialData is not backed by a Zarr store on disk: no cube", UserWarning, stacklevel=3)
        return None
    try:
        voxel, origin, shape = _frame(sdata.images[image_name], cs)
    except ValueError as err:
        warnings.warn(f"image {image_name!r} in {cs!r}: {err}: no cube", UserWarning, stacklevel=3)
        return None
    if labels_name is not None and _frame_or_none(sdata.labels[labels_name], cs) != (voxel, origin, shape):
        warnings.warn(
            f"labels {labels_name!r} are on another grid than {image_name!r}: cube shows the image only",
            UserWarning,
            stacklevel=3,
        )
        labels_name = None
    label_ids = None
    instance_key = adata.uns.get("spatialdata_attrs", {}).get("instance_key")
    if labels_name is not None and instance_key in adata.obs:
        ids = adata.obs[instance_key].to_numpy()
        label_ids = (ids if rows is None else ids[rows]).astype(np.int32)
    return VolumeSource(sel.name, image_name, labels_name, Path(sdata.path), voxel, origin, shape, label_ids)


def resolve_volume(
    sdata: Any,
    *,
    table: str | None = None,
    image: str | bool | None = None,
    labels: str | bool | None = None,
    coordinate_system: str | None = None,
    region: str | list[str] | None = None,
) -> tuple[Any, VolumeSource | None]:
    """The table to plot and, when the cube is possible, its volume source."""
    sel = select_table(sdata, table=table, coordinate_system=coordinate_system, region=region)
    rows = None if sel.keep.all() else np.flatnonzero(sel.keep)
    return sel.adata, volume_for(sdata, sel, rows=rows, image=image, labels=labels)
