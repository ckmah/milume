"""Find what the Landmarks cube needs in a SpatialData: table, image, frame, cells.

The cells are a shapes element of per-slice polygons: one row per cell and
z plane, with ``cell_id`` (the table's ``obs_names``) and ``Z_um`` (the plane's
z) columns, in the coordinate system unchanged. Images may be 2D ``(c, y, x)``
or 3D ``(c, z, y, x)``. The frame comes from the image's transform to that
coordinate system, so window coordinates and ``obsm["spatial"]`` share units
(µm for Pyxa / Meteor). Landmarks raster defaults read the same coordinate-unit
metadata (reader attrs, CosMx ``global``/``fov`` systems, NGFF axis units when
present).
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
    shapes: str | None
    root: Path
    voxel_size_um: tuple[float, float, float]
    origin_um: tuple[float, float, float]
    shape_zyx: tuple[int, int, int]
    #: Per polygon cell (first-appearance order in the file): its table row, -1 for none.
    cell_rows: np.ndarray | None
    channel_names: tuple[str, ...]
    dims: tuple[str, ...]
    is_3d: bool
    coordinate_system: str
    image_transform: dict[str, Any]
    channel_contrast_limits: tuple[tuple[float, float], ...]
    constant_zero_channels: frozenset[int]

    @property
    def shapes_path(self) -> str:
        return f"shapes/{self.shapes}/shapes.parquet"


def _level0(element: Any):
    """Level-0 DataArray of a single- or multi-scale element."""
    if hasattr(element, "children") and "scale0" in element.children:
        return next(iter(element["scale0"].values()))
    return element


def _coarsest_array(element: Any):
    levels = (
        [next(iter(element[k].values())) for k in element.children]
        if hasattr(element, "children")
        else []
    )
    return min(levels, key=lambda a: a.size) if levels else _level0(element)


def _image_layout(element: Any) -> tuple[bool, tuple[str, ...]] | None:
    dims = tuple(_level0(element).dims)
    dset = set(dims)
    if {"c", "z", "y", "x"} <= dset:
        return True, dims
    if {"c", "y", "x"} <= dset:
        return False, dims
    return None


def _channel_names(arr: Any) -> tuple[str, ...]:
    if "c" not in arr.dims:
        return ("Channel 0",)
    coord = arr.coords["c"]
    names: list[str] = []
    for i, value in enumerate(coord.values):
        if isinstance(value, str) and value:
            names.append(value)
        else:
            names.append(f"Channel {i}")
    return tuple(names)


def _constant_zero_channel_indices(arr: Any) -> frozenset[int]:
    if "c" not in arr.dims:
        data = np.asarray(arr.data, dtype=np.float64)
        return frozenset({0}) if data.size and np.all(data == 0) else frozenset()
    zeros: set[int] = set()
    for i in range(int(arr.sizes["c"])):
        slab = np.asarray(arr.isel(c=i).data, dtype=np.float64)
        if slab.size and np.all(slab == 0):
            zeros.add(i)
    return frozenset(zeros)


def image_contrast_limits(element: Any, *, channel: int = 0) -> tuple[float, float]:
    """Default Inspect contrast ``(p1, p99.9)`` of the coarsest pyramid level for one channel."""
    from .volume_cube import DEFAULT_CONTRAST_LIMITS

    arr = _coarsest_array(element)
    names = _channel_names(arr)
    idx = channel if channel < len(names) else 0
    limits = _channel_contrast_limits(arr)
    if not limits:
        return DEFAULT_CONTRAST_LIMITS
    lo, hi = limits[idx]
    if hi <= lo:
        hi = lo + 1.0
    return lo, hi


def image_channel_contrast_limits(element: Any) -> tuple[tuple[str, tuple[float, float]], ...]:
    """Per-channel ``(name, (p1, p99.9))`` on the coarsest pyramid level."""
    arr = _coarsest_array(element)
    names = _channel_names(arr)
    limits = _channel_contrast_limits(arr)
    return tuple((names[i], limits[i]) for i in range(len(names)))


def _channel_contrast_limits(arr: Any) -> tuple[tuple[float, float], ...]:
    from .volume_cube import DEFAULT_CONTRAST_LIMITS

    if "c" not in arr.dims:
        values = np.asarray(arr.data, dtype=np.float64).ravel()
        values = values[np.isfinite(values)]
        if not values.size:
            return (DEFAULT_CONTRAST_LIMITS,)
        lo, hi = float(np.percentile(values, 1)), float(np.percentile(values, 99.9))
        return ((lo, hi),)

    out: list[tuple[float, float]] = []
    for i in range(int(arr.sizes["c"])):
        values = np.asarray(arr.isel(c=i).data, dtype=np.float64).ravel()
        values = values[np.isfinite(values)]
        if not values.size:
            out.append(DEFAULT_CONTRAST_LIMITS)
            continue
        lo, hi = float(np.percentile(values, 1)), float(np.percentile(values, 99.9))
        if hi <= lo:
            hi = lo + 1.0
        out.append((lo, hi))
    return tuple(out)


def _frame(element: Any, cs: str) -> tuple[tuple[float, ...], tuple[float, ...], tuple[int, ...], bool, dict[str, Any]]:
    from spatialdata.transformations import get_transformation

    layout = _image_layout(element)
    if layout is None:
        raise ValueError("not a c,y,x or c,z,y,x image")
    is_3d, _dims = layout
    arr = _level0(element)
    if is_3d:
        shape = tuple(int(arr.sizes[a]) for a in ("z", "y", "x"))
        input_axes = ("z", "y", "x")
        output_axes = ("z", "y", "x")
    else:
        shape = (1, int(arr.sizes["y"]), int(arr.sizes["x"]))
        input_axes = ("y", "x")
        output_axes = ("y", "x")
    try:
        affine = get_transformation(element, to_coordinate_system=cs).to_affine_matrix(
            input_axes=input_axes, output_axes=output_axes
        )
    except (KeyError, ValueError) as err:
        raise ValueError(f"no scale + translation transform to {cs!r}") from err
    if is_3d:
        if not np.allclose(affine[:3, :3], np.diag(np.diag(affine[:3, :3]))):
            raise ValueError("the cube supports scale + translation transforms only")
        scale = tuple(float(v) for v in np.diag(affine[:3, :3]))
        origin = tuple(float(v) for v in affine[:3, 3])
        transform = {
            "coordinate_system": cs,
            "input_axes": list(input_axes),
            "scale": list(scale),
            "translation": list(origin),
        }
        return scale, origin, shape, is_3d, transform

    if not np.allclose(affine[:2, :2], np.diag(np.diag(affine[:2, :2]))):
        raise ValueError("the cube supports scale + translation transforms only")
    scale_yx = (float(np.diag(affine[:2, :2])[0]), float(np.diag(affine[:2, :2])[1]))
    origin_yx = (float(affine[1, 2]), float(affine[0, 2])) if affine.shape[0] >= 2 else (0.0, 0.0)
    # Stored as z,y,x with nominal z=1 µm at origin 0 for cut-box compatibility.
    scale = (1.0, scale_yx[0], scale_yx[1])
    origin = (0.0, origin_yx[0], origin_yx[1])
    transform = {
        "coordinate_system": cs,
        "input_axes": list(input_axes),
        "scale": [scale_yx[0], scale_yx[1]],
        "translation": [origin_yx[0], origin_yx[1]],
    }
    return scale, origin, shape, is_3d, transform


def _frame_or_none(element: Any, cs: str):
    try:
        return _frame(element, cs)
    except ValueError:
        return None


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
    detail = []
    for n in names:
        region = sdata.tables[n].uns.get("spatialdata_attrs", {}).get("region")
        regions = [region] if isinstance(region, str) else list(region or [])
        detail.append(f"{n!r} (annotates {regions})" if regions else repr(n))
    raise ValueError(f"several tables {', '.join(detail)}: pass table=<name>")


CELL_POLYGON_COLUMNS = ("cell_id", "Z_um")


def _is_cell_polygons(gdf: Any) -> bool:
    return set(CELL_POLYGON_COLUMNS) <= set(gdf.columns)


def _cell_rows(path: Path, obs_names: Any) -> np.ndarray:
    import pandas as pd
    import pyarrow.parquet as pq

    ids = pq.read_table(path, columns=["cell_id"]).column("cell_id").to_pandas()
    rows = pd.Index(obs_names).get_indexer(pd.unique(ids.astype(str)))
    return rows.astype(np.int32)


def _table_region(sdata: Any, adata: Any) -> str | None:
    region = adata.uns.get("spatialdata_attrs", {}).get("region")
    return region if isinstance(region, str) else None


def _element_coordinate_systems(sdata: Any, kind: str, name: str) -> set[str]:
    from spatialdata.transformations import get_transformation

    collection = getattr(sdata, kind)
    if name not in collection:
        return set()
    return set(get_transformation(collection[name], get_all=True))


def _shares_region_cs(sdata: Any, region: str | None, image_name: str, cs: str) -> bool:
    if region is None:
        return False
    region_systems: set[str] = set()
    if region in sdata.labels:
        region_systems |= _element_coordinate_systems(sdata, "labels", region)
    if region in sdata.shapes:
        region_systems |= _element_coordinate_systems(sdata, "shapes", region)
    image_systems = _element_coordinate_systems(sdata, "images", image_name)
    shared = region_systems & image_systems
    return cs in shared if shared else False


def _cells_have_z(adata: Any, shapes_name: str | None, sdata: Any) -> bool:
    spatial = adata.obsm.get("spatial")
    if spatial is not None and getattr(spatial, "shape", (0,))[1] >= 3:
        z = np.asarray(spatial[:, 2], dtype=np.float64)
        if np.any(np.isfinite(z)):
            return True
    if shapes_name is not None and shapes_name in sdata.shapes:
        if "Z_um" in sdata.shapes[shapes_name].columns:
            return True
    return False


def _auto_pick_image(
    sdata: Any,
    *,
    cs: str,
    region: str | None,
    cells_have_z: bool,
) -> tuple[str | None, list[str]]:
    viable: list[tuple[str, bool, bool, float, float]] = []
    for name, element in sdata.images.items():
        if _image_layout(element) is None:
            continue
        framed = _frame_or_none(element, cs)
        if framed is None:
            continue
        _scale, _origin, shape, is_3d, _transform = framed
        shares = _shares_region_cs(sdata, region, name, cs)
        sz, sy, sx = framed[0]
        extent = float(shape[0] * abs(sz) * shape[1] * abs(sy) * shape[2] * abs(sx))
        min_voxel = min(abs(v) for v in framed[0] if v != 0) if any(framed[0]) else 0.0
        viable.append((name, shares, is_3d, min_voxel, extent))

    if not viable:
        return None, []

    def sort_key(item: tuple[str, bool, bool, float, float]) -> tuple:
        name, shares, is_3d, min_voxel, extent = item
        prefer_z = -int(is_3d) if cells_have_z else 0
        return (-int(shares), prefer_z, -min_voxel, -extent, name)

    viable.sort(key=sort_key)
    picked = viable[0][0]
    skipped = [n for n, *_ in viable[1:]]
    return picked, skipped


def _build_volume_source(
    sdata: Any,
    *,
    table_name: str,
    image_name: str,
    shapes_name: str | None,
    cs: str,
    adata: Any,
) -> VolumeSource | None:
    element = sdata.images[image_name]
    try:
        voxel, origin, shape, is_3d, transform = _frame(element, cs)
    except ValueError as err:
        warnings.warn(f"image {image_name!r} in {cs!r}: {err}: no cube", UserWarning, stacklevel=2)
        return None
    coarse = _coarsest_array(element)
    channel_names = _channel_names(coarse)
    contrast = _channel_contrast_limits(coarse)
    constant_zero = _constant_zero_channel_indices(coarse)
    cell_rows = None
    if shapes_name is not None:
        cell_rows, problem = _shapes_problem(sdata, shapes_name, cs, adata)
        if problem:
            warnings.warn(
                f"shapes {shapes_name!r} {problem}: cube shows the image only",
                UserWarning,
                stacklevel=2,
            )
            shapes_name = None
    return VolumeSource(
        table_name,
        image_name,
        shapes_name,
        Path(sdata.path),
        voxel,
        origin,
        shape,
        cell_rows,
        channel_names,
        tuple(_level0(element).dims),
        is_3d,
        cs,
        transform,
        contrast,
        constant_zero,
    )


def resolve_volume(
    sdata: Any,
    *,
    table: str | None = None,
    image: str | bool | None = None,
    shapes: str | bool | None = None,
) -> tuple[Any, VolumeSource | None]:
    """The table to plot and, when an image can be served, its volume source.

    ``image`` / ``shapes``: an element name, ``None`` to infer, or ``False`` to
    leave it out. ``shapes`` is inferred when exactly one shapes element has
    ``cell_id`` and ``Z_um`` columns. ``image`` is inferred from 2D and 3D
    multiscale images with a deterministic tie-break when several qualify; a
    ``UserWarning`` names the image picked and the ones skipped (pass
    ``image=<name>`` to override). No qualifying image means no volume (most
    SpatialData are table-only). Warns (and returns no source) when the
    SpatialData is not backed by a Zarr store on disk or the chosen image
    transform is not scale + translation.
    """
    table_name = _pick_table(sdata, table)
    adata = sdata.tables[table_name]
    cs = "global"

    shapes_name = None
    if isinstance(shapes, str):
        shapes_name = shapes
    elif shapes is not False:
        found = [n for n, g in sdata.shapes.items() if _is_cell_polygons(g)]
        shapes_name = found[0] if len(found) == 1 else None
    if shapes_name is not None:
        from spatialdata.transformations import get_transformation

        systems = list(get_transformation(sdata.shapes[shapes_name], get_all=True))
        cs = "global" if "global" in systems else systems[0]

    region = _table_region(sdata, adata)
    cells_have_z = _cells_have_z(adata, shapes_name, sdata)

    image_name: str | None = None
    skipped: list[str] = []
    if image is not False:
        if isinstance(image, str):
            image_name = image
        else:
            image_name, skipped = _auto_pick_image(
                sdata, cs=cs, region=region, cells_have_z=cells_have_z
            )
            if image_name is not None and skipped:
                warnings.warn(
                    f"image {image_name!r} picked; skipped {', '.join(skipped)}: pass image=<name>",
                    UserWarning,
                    stacklevel=2,
                )
    if image_name is None:
        return adata, None
    if getattr(sdata, "path", None) is None:
        warnings.warn("SpatialData is not backed by a Zarr store on disk: no cube", UserWarning, stacklevel=2)
        return adata, None

    return adata, _build_volume_source(
        sdata,
        table_name=table_name,
        image_name=image_name,
        shapes_name=shapes_name,
        cs=cs,
        adata=adata,
    )


def _shapes_problem(sdata: Any, name: str, cs: str, adata: Any) -> tuple[np.ndarray | None, str]:
    """The polygon cells' table rows, or why the cube cannot mesh them."""
    from spatialdata.transformations import get_transformation

    gdf = sdata.shapes[name]
    if not _is_cell_polygons(gdf):
        return None, f"lack {' / '.join(CELL_POLYGON_COLUMNS)} columns"
    try:
        affine = get_transformation(gdf, to_coordinate_system=cs).to_affine_matrix(
            input_axes=("x", "y"), output_axes=("x", "y")
        )
    except (KeyError, ValueError):
        return None, f"have no transform to {cs!r}"
    if not np.allclose(affine, np.eye(3)):
        return None, f"are not in {cs!r} coordinates as stored"
    path = Path(sdata.path) / "shapes" / name / "shapes.parquet"
    if not path.is_file():
        return None, "are not written as one parquet file"
    return _cell_rows(path, adata.obs_names), ""
