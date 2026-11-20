"""Micrometre scale for the Layers size slider (#473)."""

from __future__ import annotations

import numpy as np
import pytest

from milume import LandmarksWidget
from milume.landmarks import _default_point_radius
from milume.spatial_units import infer_um_per_unit
from tests.helpers import adata_xy


def test_missing_scale_stays_unknown_and_keeps_raw_radius():
    adata = adata_xy([0.0, 1.0, 2.0, 3.0], np.zeros(4))
    assert infer_um_per_unit(adata) is None
    w = LandmarksWidget(adata)
    assert w._um_per_unit is None
    assert w._cells_visible is True
    assert w.point_size == pytest.approx(0.4)


def test_spatial_units_micrometer_is_one_um_per_unit():
    adata = adata_xy([0.0, 10.0, 20.0, 30.0], np.zeros(4))
    adata.uns["spatial_units"] = "µm"
    assert infer_um_per_unit(adata) == pytest.approx(1.0)
    w = LandmarksWidget(adata)
    assert w._um_per_unit == pytest.approx(1.0)
    # Radius 0.4 * 10 µm spacing = 4 µm, diameter 8 µm, inside 1 to 50.
    assert w.point_size == pytest.approx(4.0)


def test_microns_per_pixel_scales_the_default_diameter():
    adata = adata_xy([0.0, 10.0, 20.0, 30.0], np.zeros(4))
    adata.uns["spatial"] = {"library": {"scalefactors": {"microns_per_pixel": 0.5}}}
    assert infer_um_per_unit(adata) == pytest.approx(0.5)
    w = LandmarksWidget(adata)
    # Radius 4 px * 0.5 µm/px = 2 µm radius, diameter 4 µm.
    assert w._um_per_unit == pytest.approx(0.5)
    assert w.point_size == pytest.approx(4.0)
    assert 2.0 * w.point_size * w._um_per_unit == pytest.approx(4.0)


def test_default_diameter_clamps_into_1_to_50_um():
    # 0.4 * 2 = 0.8 µm radius, diameter 1.6, stays.
    assert _default_point_radius(0.8, 1.0) == pytest.approx(0.8)
    # Huge spacing: diameter would be 80 µm, clamp to 50 (radius 25).
    assert _default_point_radius(40.0, 1.0) == pytest.approx(25.0)
    # Tiny spacing: diameter 0.2 µm, clamp to 1 (radius 0.5).
    assert _default_point_radius(0.1, 1.0) == pytest.approx(0.5)
    assert _default_point_radius(4.0, None) == pytest.approx(4.0)


def test_xenium_reader_coordinates_are_micrometres():
    adata = adata_xy([0.0, 10.0, 20.0], np.zeros(3))
    adata.uns["spatialdata_io_reader"] = "xenium"
    assert infer_um_per_unit(adata) == pytest.approx(1.0)


def test_pixel_table_uses_image_scale_into_micrometres(monkeypatch):
    class Axes:
        def __init__(self, unit):
            self._axes = [
                {"name": "y", "type": "space", "unit": unit},
                {"name": "x", "type": "space", "unit": unit},
            ]

    class Transform:
        scale = (0.25, 0.25)
        output_coordinate_system = Axes("micrometer")

    class Images:
        def values(self):
            return [object()]

    class Sdata:
        attrs = {}
        coordinate_systems = ["global"]
        images = Images()
        labels = {}
        shapes = {}

    def fake_get(_element, to_coordinate_system):
        assert to_coordinate_system == "global"
        return Transform()

    monkeypatch.setattr("spatialdata.transformations.get_transformation", fake_get)
    adata = adata_xy([0.0, 40.0, 80.0], np.zeros(3))
    adata.uns["spatialdata_io_reader"] = "cosmx"
    assert infer_um_per_unit(adata, spatial_key="global", sdata=Sdata()) == pytest.approx(0.25)


def test_hiding_cells_does_not_change_point_size():
    w = LandmarksWidget(adata_xy([0.0, 2.0, 4.0], np.zeros(3)))
    size = w.point_size
    w._cells_visible = False
    assert w.point_size == pytest.approx(size)
    w._cells_visible = True
    assert w.point_size == pytest.approx(size)
