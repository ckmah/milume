"""Milume: explore spatial biology in your notebook."""

from __future__ import annotations

from . import datasets
from .landmarks import _LANDMARKS_API_DOC, ColorKeyError, ColorValueError, LandmarksWidget
from .measure import (
    along_positions,
    composition,
    distances,
    enrichment,
    nearest_distances,
    write_obs,
)
from .spatialdata_landmarks import (
    geodataframe_to_landmarks,
    landmarks_to_geodataframe,
)

ds = datasets

__version__ = "2.1.0"


def peek(data, **kwargs) -> LandmarksWidget:
    """Open a Milume surface on AnnData or SpatialData."""
    return LandmarksWidget(data, **kwargs)


peek.__doc__ = (
    """Open a Milume surface on AnnData or SpatialData.

Main notebook entry point for interactive landmarks. Constructs
`LandmarksWidget` with the same keyword arguments.

"""
    + _LANDMARKS_API_DOC
    + """
Returns
-------
LandmarksWidget
    Widget handle ``w``. Synced traitlets include ``w.selections`` and
    ``w.landmarks``; join to ``adata`` with
    `get_obs_names(region)`.

Examples
--------
>>> import milume
>>> w = milume.peek(adata, color="cell_type")
>>> w = milume.peek(sdata)  # table, image, cell polygons inferred
"""
)



__all__ = [
    "ColorKeyError",
    "ColorValueError",
    "LandmarksWidget",
    "__version__",
    "along_positions",
    "composition",
    "datasets",
    "distances",
    "ds",
    "enrichment",
    "geodataframe_to_landmarks",
    "landmarks_to_geodataframe",
    "nearest_distances",
    "peek",
    "write_obs",
]
