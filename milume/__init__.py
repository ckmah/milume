"""Milume: a thinking surface for spatial omics."""

from .landmarks import _LANDMARKS_API_DOC, LandmarksWidget
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

__version__ = "1.2.0"


def peek(data, **kwargs) -> LandmarksWidget:
    """Open a Milume surface on AnnData or SpatialData."""
    return LandmarksWidget(data, **kwargs)


peek.__doc__ = (
    """Open a Milume surface on AnnData or SpatialData.

    Main notebook entry point for interactive landmarks. Constructs
    :class:`~milume.landmarks.LandmarksWidget` with the same keyword arguments.

    """
    + _LANDMARKS_API_DOC
    + """

    Returns
    -------
    LandmarksWidget
        Widget handle ``w``. Synced traitlets include ``w.selections`` and
        ``w.landmarks``; join to ``adata`` with
        :meth:`~milume.landmarks.LandmarksWidget.get_obs_names` /
        :meth:`~milume.landmarks.LandmarksWidget.assign_obs_mask`.

    Examples
    --------
    >>> import milume
    >>> w = milume.peek(adata, color="cell_type")
    >>> w = milume.peek(sdata)  # table, labels, image inferred
    """
)



__all__ = [
    "LandmarksWidget",
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
