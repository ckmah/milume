"""Landmarks ↔ GeoDataFrame IO (M1 contract).

See ``docs/landmarks-spatialdata-contract.md``. Control vertices live in a JSON
``vertices`` column. ``geometry`` is a GIS proxy: ``Point`` / ``LineString`` /
``Polygon``. Spline ``LineString`` densifies the cardinal curve; round-trip
always restores control points from ``vertices`` (never from densified coords).
"""

from __future__ import annotations

import json
from typing import Any

from .measure import cardinal_sample

DEFAULT_POINT_RADIUS = 1.0
_LANDMARK_TYPES = frozenset({"point", "line", "spline", "shape"})


def _require_geopandas():
    try:
        import geopandas  # noqa: F401
        import shapely  # noqa: F401
    except ImportError as e:  # pragma: no cover
        raise ImportError(
            "landmarks GeoDataFrame IO requires geopandas and shapely"
        ) from e


def _vertices_list(raw: Any) -> list[list[float]]:
    if raw is None:
        return []
    out: list[list[float]] = []
    for v in raw:
        if v is None or len(v) < 2:
            continue
        out.append([float(v[0]), float(v[1])])
    return out


def _vertices_json(vertices: list[list[float]]) -> str:
    return json.dumps(vertices)


def _parse_vertices_json(value: Any) -> list[list[float]]:
    if value is None:
        return []
    if isinstance(value, list):
        return _vertices_list(value)
    text = str(value).strip()
    if not text:
        return []
    return _vertices_list(json.loads(text))


def _proxy_geometry(kind: str, vertices: list[list[float]], tension: float = 0.0):
    from shapely.geometry import LineString, Point, Polygon

    if not vertices:
        raise ValueError(f"landmark type {kind!r} has no vertices")
    if kind == "point":
        return Point(vertices[0][0], vertices[0][1])
    if kind == "line":
        if len(vertices) < 2:
            raise ValueError("line landmarks need at least 2 vertices")
        return LineString(vertices)
    if kind == "spline":
        sampled = cardinal_sample(vertices, float(tension), n_per_seg=20, closed=False)
        if len(sampled) < 2:
            raise ValueError("spline landmarks need at least 2 sample points")
        return LineString(sampled)
    if kind == "shape":
        ring = list(vertices)
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        if len(ring) < 4:
            raise ValueError("shape landmarks need at least 3 distinct vertices")
        return Polygon(ring)
    raise ValueError(f"unsupported landmark type: {kind!r}")


def _vertices_from_geometry(geom) -> tuple[str | None, list[list[float]]]:
    """Fallback when the ``vertices`` column is missing. Returns (coerce_type, verts).

    Densified spline ``LineString``s are imported as ``line`` polylines so a later
    export does not re-sample (degenerate) the curve.
    """
    if geom is None or getattr(geom, "is_empty", False):
        return None, []
    gtype = geom.geom_type
    if gtype == "Point":
        return None, [[float(geom.x), float(geom.y)]]
    if gtype == "LineString":
        coords = [[float(x), float(y)] for x, y in geom.coords]
        return "line", coords
    if gtype == "Polygon":
        coords = list(geom.exterior.coords)
        if len(coords) >= 2 and coords[0] == coords[-1]:
            coords = coords[:-1]
        return None, [[float(x), float(y)] for x, y in coords]
    return None, []


def landmarks_to_geodataframe(landmarks: list[dict] | None):
    """Convert widget landmark dicts to a GeoDataFrame.

    Empty ``landmarks`` yields an empty GeoDataFrame with the contract columns.
    Callers own any SpatialData assignment (e.g. ``sdata["landmarks"] = gdf``).
    """
    _require_geopandas()
    import geopandas as gpd
    import pandas as pd

    rows: list[dict[str, Any]] = []
    geoms = []
    for lm in landmarks or []:
        kind = str(lm.get("type") or "point")
        if kind not in _LANDMARK_TYPES:
            raise ValueError(f"unsupported landmark type: {kind!r}")
        verts = _vertices_list(lm.get("vertices"))
        tension = float(lm.get("tension") or 0.0)
        geoms.append(_proxy_geometry(kind, verts, tension=tension))
        rows.append(
            {
                "id": str(lm.get("id") or ""),
                "type": kind,
                "vertices": _vertices_json(verts),
                "tension": tension,
                "buffer_width": float(lm.get("buffer_width") or 0.0),
                "buffer_side": str(lm.get("buffer_side") or "both"),
                "radius": float(DEFAULT_POINT_RADIUS),
            }
        )
    if not rows:
        return gpd.GeoDataFrame(
            {
                "id": pd.Series(dtype="object"),
                "type": pd.Series(dtype="object"),
                "vertices": pd.Series(dtype="object"),
                "tension": pd.Series(dtype="float64"),
                "buffer_width": pd.Series(dtype="float64"),
                "buffer_side": pd.Series(dtype="object"),
                "radius": pd.Series(dtype="float64"),
            },
            geometry=gpd.GeoSeries([], dtype="geometry"),
        )
    return gpd.GeoDataFrame(rows, geometry=geoms)


def geodataframe_to_landmarks(gdf) -> list[dict]:
    """Convert a landmarks GeoDataFrame back to widget dicts (``[]`` if empty)."""
    if gdf is None or len(gdf) == 0:
        return []
    has_vertices_col = "vertices" in getattr(gdf, "columns", [])
    out: list[dict] = []
    for _, row in gdf.iterrows():
        kind = str(row.get("type") or "point")
        verts: list[list[float]] = []
        if has_vertices_col:
            verts = _parse_vertices_json(row.get("vertices"))
        coerce_type: str | None = None
        if not verts:
            coerce_type, verts = _vertices_from_geometry(row.geometry)
        if coerce_type is not None:
            kind = coerce_type
        lm: dict[str, Any] = {
            "id": str(row.get("id") or ""),
            "type": kind,
            "vertices": verts,
        }
        if "tension" in gdf.columns and row.get("tension") is not None:
            lm["tension"] = float(row["tension"])
        if "buffer_width" in gdf.columns and row.get("buffer_width") is not None:
            lm["buffer_width"] = float(row["buffer_width"])
        if "buffer_side" in gdf.columns and row.get("buffer_side") is not None:
            lm["buffer_side"] = str(row["buffer_side"])
        out.append(lm)
    return out
