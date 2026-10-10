"""Infer whether table ``obsm`` x/y coordinates are micrometers or pixels.

Used internally for default raster bin/window sizing. Not part of the public API.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from anndata import AnnData

SpatialUnits = Literal["micrometer", "pixel"]

_MICROMETER_UNIT_TOKENS = frozenset(
    {
        "micrometer",
        "micrometre",
        "millimeter",
        "millimetre",
        "µm",
        "um",
    }
)
_PIXEL_UNIT_TOKENS = frozenset({"pixel", "pixels", "px"})

_READER_SPATIAL_UNITS: dict[str, SpatialUnits] = {
    "xenium": "micrometer",
    "cosmx": "pixel",
    "pyxa": "micrometer",
}

# Fallback only when no metadata: median NN above this is treated as pixel space.
_PIXEL_NN_HEURISTIC_FLOOR = 50.0


def _normalize_unit_token(unit: str | None) -> SpatialUnits | None:
    if unit is None:
        return None
    token = str(unit).strip().lower()
    if token in _MICROMETER_UNIT_TOKENS or token.startswith("micro"):
        return "micrometer"
    if token in _PIXEL_UNIT_TOKENS:
        return "pixel"
    return None


def _units_from_ngff_axes(axes: Any) -> SpatialUnits | None:
    units: list[SpatialUnits] = []
    for axis in axes or []:
        if isinstance(axis, dict):
            if axis.get("type") != "space":
                continue
            parsed = _normalize_unit_token(axis.get("unit"))
        else:
            if getattr(axis, "type", None) != "space":
                continue
            parsed = _normalize_unit_token(getattr(axis, "unit", None))
        if parsed is not None:
            units.append(parsed)
    if not units:
        return None
    if len(set(units)) == 1:
        return units[0]
    return None


def _output_units_from_transformation(transformation: Any) -> SpatialUnits | None:
    from spatialdata.transformations.transformations import Sequence

    if isinstance(transformation, Sequence):
        for step in reversed(transformation.transformations):
            found = _output_units_from_transformation(step)
            if found is not None:
                return found
        return None
    output_cs = getattr(transformation, "output_coordinate_system", None)
    if output_cs is None:
        return None
    axes = getattr(output_cs, "_axes", None)
    if axes is None and hasattr(output_cs, "axes"):
        axes = output_cs.axes
    return _units_from_ngff_axes(axes)


def _units_from_element_to_cs(element: Any, coordinate_system: str) -> SpatialUnits | None:
    from spatialdata.transformations import get_transformation

    try:
        transformation = get_transformation(element, to_coordinate_system=coordinate_system)
    except (KeyError, TypeError, ValueError):
        return None
    return _output_units_from_transformation(transformation)


def _units_from_zarr_ome(sdata: Any, *, kind: str, element_name: str) -> SpatialUnits | None:
    path = getattr(sdata, "path", None)
    if path is None:
        return None
    try:
        import zarr
    except ImportError:
        return None
    group_path = path / kind / element_name
    if not group_path.exists():
        return None
    try:
        group = zarr.open_group(str(group_path), mode="r")
        ome = dict(group.attrs).get("ome")
        if not isinstance(ome, dict):
            return None
        multiscales = ome.get("multiscales")
        if not isinstance(multiscales, list) or not multiscales:
            return None
        axes = multiscales[0].get("axes")
        return _units_from_ngff_axes(axes)
    except Exception:
        return None


def _looks_like_pyxa_sdata(sdata: Any) -> bool:
    tables = getattr(sdata, "tables", None)
    images = getattr(sdata, "images", None)
    if tables is None or images is None:
        return False
    return "rna" in tables and "mosaic_image" in images


def _reader_from_sources(sdata: Any | None, adata: AnnData) -> str | None:
    if sdata is not None:
        reader = getattr(sdata, "attrs", {}).get("spatialdata_io_reader")
        if reader:
            return str(reader)
        if _looks_like_pyxa_sdata(sdata):
            return "pyxa"
    reader = adata.uns.get("spatialdata_io_reader")
    if reader:
        return str(reader)
    return None


def _cosmx_obsm_units(spatial_key: str, sdata: Any | None) -> SpatialUnits | None:
    if spatial_key in {"global", "spatial"}:
        return "pixel"
    if sdata is not None and spatial_key in getattr(sdata, "coordinate_systems", []):
        return "pixel"
    return None


def _linked_spatial_element(sdata: Any, adata: AnnData) -> tuple[str, str, Any] | None:
    attrs = adata.uns.get("spatialdata_attrs", {})
    region = attrs.get("region")
    if isinstance(region, str):
        regions = [region]
    elif region:
        regions = list(region)
    else:
        return None
    for name in regions:
        if name in sdata.labels:
            return "labels", name, sdata.labels[name]
        if name in sdata.images:
            return "images", name, sdata.images[name]
        if name in getattr(sdata, "shapes", {}):
            return "shapes", name, sdata.shapes[name]
    return None


def _coordinate_system_for_obsm(
    sdata: Any | None,
    *,
    spatial_key: str,
    adata: AnnData,
) -> str | None:
    if spatial_key == "global":
        return "global"
    if sdata is not None and spatial_key in getattr(sdata, "coordinate_systems", []):
        return spatial_key
    if spatial_key in adata.obsm and spatial_key != "spatial":
        return spatial_key
    attrs = adata.uns.get("spatialdata_attrs", {})
    region = attrs.get("region")
    if isinstance(region, str):
        return "global"
    return None


def infer_obsm_spatial_units(
    adata: AnnData,
    *,
    spatial_key: str = "spatial",
    sdata: Any | None = None,
) -> SpatialUnits | None:
    """Return ``micrometer`` or ``pixel`` when known; ``None`` if only the heuristic may decide."""
    reader = _reader_from_sources(sdata, adata)
    if reader in _READER_SPATIAL_UNITS:
        units = _READER_SPATIAL_UNITS[reader]
        if reader == "cosmx":
            cosmx_units = _cosmx_obsm_units(spatial_key, sdata)
            if cosmx_units is not None:
                return cosmx_units
        return units

    coordinate_system = _coordinate_system_for_obsm(sdata, spatial_key=spatial_key, adata=adata)
    if sdata is not None and coordinate_system is not None:
        linked = _linked_spatial_element(sdata, adata)
        if linked is not None:
            kind, element_name, element = linked
            found = _units_from_element_to_cs(element, coordinate_system)
            if found is not None:
                return found
            found = _units_from_zarr_ome(sdata, kind=kind, element_name=element_name)
            if found is not None:
                return found

    if sdata is not None and _looks_like_pyxa_sdata(sdata):
        return "micrometer"

    return None


def default_raster_scales(
    x_arr: Any,
    y_arr: Any,
    *,
    units: SpatialUnits | None = None,
    median_nn: float | None = None,
) -> tuple[float, float]:
    """Default raster bin and window in the same units as ``x_arr`` / ``y_arr``."""
    import numpy as np

    from .landmarks import DEFAULT_BIN_SIZE, DEFAULT_WINDOW_RADIUS, _median_nn_distance

    if units == "micrometer":
        return DEFAULT_BIN_SIZE, DEFAULT_WINDOW_RADIUS
    if units == "pixel":
        nn = median_nn if median_nn is not None else _median_nn_distance(x_arr, y_arr)
        if nn is None or not np.isfinite(nn) or nn <= 0:
            return DEFAULT_BIN_SIZE, DEFAULT_WINDOW_RADIUS
        bin_size = max(2.0 * nn, 1e-9)
        return bin_size, 3.0 * bin_size

    nn = median_nn if median_nn is not None else _median_nn_distance(x_arr, y_arr)
    if (
        nn is None
        or not np.isfinite(nn)
        or nn <= 0
        or nn <= _PIXEL_NN_HEURISTIC_FLOOR
    ):
        return DEFAULT_BIN_SIZE, DEFAULT_WINDOW_RADIUS
    bin_size = max(2.0 * nn, 1e-9)
    return bin_size, 3.0 * bin_size
