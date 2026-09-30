"""Milume: a thinking surface for spatial omics."""

from .landmarks import LandmarksWidget
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

__version__ = "1.0.1"


def peek(data, **kwargs) -> LandmarksWidget:
    """Open a Milume surface on AnnData or SpatialData.

    Shorthand for ``LandmarksWidget(data, **kwargs)``.
    """
    return LandmarksWidget(data, **kwargs)


from .volume_cube import VolumeCubeWidget

__all__ = [
    "LandmarksWidget",
    "VolumeCubeWidget",
    "__version__",
    "along_positions",
    "composition",
    "distances",
    "enrichment",
    "geodataframe_to_landmarks",
    "landmarks_to_geodataframe",
    "nearest_distances",
    "peek",
    "write_obs",
]
