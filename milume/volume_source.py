"""Find what the Landmarks cube needs in a SpatialData: table, 3D image, frame, cells.

The cells are a shapes element of per-slice polygons: one row per cell and
z plane, with ``cell_id`` (the table's ``obs_names``) and ``Z_um`` (the plane's
z) columns, in the coordinate system unchanged. The image is the only 3D image.
The frame comes from the image's transform to that coordinate system, so window
coordinates and ``obsm["spatial"]`` share units (µm for Pyxa / Meteor). Landmarks
raster defaults read the same coordinate-unit metadata (reader attrs, CosMx
``global``/``fov`` systems, NGFF axis units when present).
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

    @property
    def shapes_path(self) -> str:
        return f"shapes/{self.shapes}/shapes.parquet"


def _level0(element: Any):
    """Level-0 DataArray of a single- or multi-scale element."""
    if hasattr(element, "children") and "scale0" in element.children:
        return next(iter(element["scale0"].values()))
    return element


def image_contrast_limits(element: Any) -> tuple[float, float]:
    """Default Inspect contrast ``(p1, max)`` of the coarsest pyramid level.

    The coarsest level already compresses the dynamic range, so its max is the
    upper limit; a high percentile there clips bright tissue to white.
    """
    from .volume_cube import DEFAULT_CONTRAST_LIMITS

    levels = [next(iter(element[k].values())) for k in element.children] if hasattr(element, "children") else []
    arr = min(levels, key=lambda a: a.size) if levels else element
    if "c" in arr.dims:
        arr = arr.isel(c=0)
    values = np.asarray(arr.data, dtype=np.float64).ravel()
    values = values[np.isfinite(values)]
    if not values.size:
        return DEFAULT_CONTRAST_LIMITS
    lo, hi = float(np.percentile(values, 1)), float(values.max())
    if hi <= lo:
        hi = lo + 1.0
    return lo, hi


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


def resolve_volume(
    sdata: Any,
    *,
    table: str | None = None,
    image: str | bool | None = None,
    shapes: str | bool | None = None,
) -> tuple[Any, VolumeSource | None]:
    """The table to plot and, when the cube is possible, its volume source.

    ``image`` / ``shapes``: an element name, ``None`` to infer, or ``False`` to
    leave it out. ``shapes`` is inferred when exactly one shapes element has
    ``cell_id`` and ``Z_um`` columns; ``image`` when exactly one 3D image exists
    (several: warn and pass ``image=<name>``). No 3D image means no cube
    (silently: most SpatialData are 2D); warns (and returns no source) when a
    3D image cannot be served, i.e. the SpatialData is not backed by a Zarr
    store on disk or its transform is not scale + translation.
    """
    table_name = _pick_table(sdata, table)
    adata = sdata.tables[table_name]
    attrs = adata.uns.get("spatialdata_attrs", {})
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

    image_name = None
    if image is not False:
        if isinstance(image, str):
            image_name = image
        else:
            images3d = [n for n, e in sdata.images.items() if "z" in _level0(e).dims]
            if len(images3d) == 1:
                image_name = images3d[0]
            elif len(images3d) > 1:
                warnings.warn(
                    f"several 3D images {', '.join(images3d)}: pass image=<name>",
                    UserWarning,
                    stacklevel=2,
                )
    if image_name is None:
        return adata, None
    if getattr(sdata, "path", None) is None:
        warnings.warn("SpatialData is not backed by a Zarr store on disk: no cube", UserWarning, stacklevel=2)
        return adata, None

    try:
        voxel, origin, shape = _frame(sdata.images[image_name], cs)
    except ValueError as err:
        warnings.warn(f"image {image_name!r} in {cs!r}: {err}: no cube", UserWarning, stacklevel=2)
        return adata, None
    cell_rows = None
    if shapes_name is not None:
        cell_rows, problem = _shapes_problem(sdata, shapes_name, cs, adata)
        if problem:
            warnings.warn(f"shapes {shapes_name!r} {problem}: cube shows the image only", UserWarning, stacklevel=2)
            shapes_name = None
    return adata, VolumeSource(table_name, image_name, shapes_name, Path(sdata.path), voxel, origin, shape, cell_rows)


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
