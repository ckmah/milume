"""Landmarks ↔ GeoDataFrame persistence contract (docs/landmarks-spatialdata-contract.md)."""

from __future__ import annotations

import pytest

pytest.importorskip("geopandas")
pytest.importorskip("shapely")

from spatial_rx.spatialdata_landmarks import (
    geodataframe_to_landmarks,
    landmarks_to_geodataframe,
)


SAMPLE = [
    {
        "id": "lm-1",
        "type": "point",
        "vertices": [[1.0, 2.0]],
    },
    {
        "id": "lm-2",
        "type": "line",
        "vertices": [[0.0, 0.0], [3.0, 4.0]],
        "buffer_width": 1.5,
        "buffer_side": "left",
    },
    {
        "id": "lm-3",
        "type": "spline",
        "vertices": [[0.0, 0.0], [1.0, 2.0], [2.0, 0.0]],
        "tension": 0.35,
    },
    {
        "id": "lm-4",
        "type": "shape",
        "vertices": [[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]],
        "tension": 0.1,
        "buffer_width": 0.0,
        "buffer_side": "both",
    },
]


def _assert_landmarks_equal(got, expected):
    assert len(got) == len(expected)
    by_id = {str(lm["id"]): lm for lm in got}
    for exp in expected:
        lm = by_id[str(exp["id"])]
        assert lm["type"] == exp["type"]
        assert "label" not in lm
        assert len(lm["vertices"]) == len(exp["vertices"])
        for a, b in zip(lm["vertices"], exp["vertices"], strict=True):
            assert a[0] == pytest.approx(b[0])
            assert a[1] == pytest.approx(b[1])
        if "tension" in exp:
            assert float(lm.get("tension", 0)) == pytest.approx(float(exp["tension"]))
        if "buffer_width" in exp:
            assert float(lm.get("buffer_width", 0)) == pytest.approx(
                float(exp["buffer_width"])
            )
        if "buffer_side" in exp:
            assert lm.get("buffer_side", "both") == exp["buffer_side"]


def test_round_trip_geodataframe():
    gdf = landmarks_to_geodataframe(SAMPLE)
    assert len(gdf) == len(SAMPLE)
    assert "label" not in gdf.columns
    got = geodataframe_to_landmarks(gdf)
    _assert_landmarks_equal(got, SAMPLE)


def test_line_and_spline_export_as_linestring():
    from shapely.geometry import LineString, Point, Polygon

    gdf = landmarks_to_geodataframe(SAMPLE)
    by_id = {row["id"]: row for _, row in gdf.iterrows()}
    assert isinstance(by_id["lm-1"].geometry, Point)
    assert isinstance(by_id["lm-2"].geometry, LineString)
    assert list(by_id["lm-2"].geometry.coords) == [(0.0, 0.0), (3.0, 4.0)]
    assert isinstance(by_id["lm-3"].geometry, LineString)
    spline_coords = list(by_id["lm-3"].geometry.coords)
    # Densified approximation — more vertices than the 3 control points.
    assert len(spline_coords) > 3
    assert spline_coords[0] == pytest.approx((0.0, 0.0))
    assert spline_coords[-1] == pytest.approx((2.0, 0.0))
    assert isinstance(by_id["lm-4"].geometry, Polygon)


def test_spline_round_trip_does_not_degenerate():
    """Control vertices stay controls; densified LineString is not reimported as controls."""
    gdf = landmarks_to_geodataframe(SAMPLE)
    mid = geodataframe_to_landmarks(gdf)
    _assert_landmarks_equal(mid, SAMPLE)
    # Second hop: still the same 3 controls (not densified sample count).
    again = geodataframe_to_landmarks(landmarks_to_geodataframe(mid))
    _assert_landmarks_equal(again, SAMPLE)
    spline = next(lm for lm in again if lm["id"] == "lm-3")
    assert len(spline["vertices"]) == 3

    # Geometry-only import (no vertices column): LineString becomes a polyline line.
    gdf2 = landmarks_to_geodataframe(
        [
            {
                "id": "lm-s",
                "type": "spline",
                "vertices": [[0.0, 0.0], [1.0, 2.0], [2.0, 0.0]],
                "tension": 0.35,
            }
        ]
    )
    dense = list(gdf2.geometry.iloc[0].coords)
    assert len(dense) > 3
    gdf2 = gdf2.drop(columns=["vertices"])
    imported = geodataframe_to_landmarks(gdf2)
    assert len(imported) == 1
    assert imported[0]["type"] == "line"
    assert len(imported[0]["vertices"]) == len(dense)
    # Re-export as line keeps the same polyline (no further densify).
    gdf3 = landmarks_to_geodataframe(imported)
    assert list(gdf3.geometry.iloc[0].coords) == pytest.approx(dense)


def test_empty_landmarks_geodataframe():
    gdf = landmarks_to_geodataframe([])
    assert len(gdf) == 0
    for col in (
        "id",
        "type",
        "vertices",
        "tension",
        "buffer_width",
        "buffer_side",
        "radius",
    ):
        assert col in gdf.columns
    assert "label" not in gdf.columns
    assert geodataframe_to_landmarks(gdf) == []
    assert geodataframe_to_landmarks(None) == []
