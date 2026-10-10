"""Coordinate-unit metadata for default raster bin/window sizing (#110)."""

from __future__ import annotations

import numpy as np
import pytest

from milume import LandmarksWidget
from milume.spatial_units import (
    _units_from_ngff_axes,
    default_raster_scales,
    infer_obsm_spatial_units,
)
from tests.helpers import adata_xy
from tests.platform_fixtures import read_cosmx, read_pyxa, read_xenium


@pytest.fixture(scope="module")
def xenium_sdata():
    return read_xenium()


def test_xenium_fixture_uses_micrometer_bins_from_metadata(xenium_sdata):
    units = infer_obsm_spatial_units(
        xenium_sdata.tables["table"], spatial_key="spatial", sdata=xenium_sdata
    )
    assert units == "micrometer"
    w = LandmarksWidget(xenium_sdata)
    assert w.raster_bin_size == pytest.approx(8.0)
    assert w.raster_window_radius == pytest.approx(24.0)


@pytest.fixture(scope="module")
def cosmx_sdata():
    return read_cosmx()


def test_cosmx_global_px_bins_from_metadata(cosmx_sdata):
    units = infer_obsm_spatial_units(
        cosmx_sdata.tables["table"], spatial_key="global", sdata=cosmx_sdata
    )
    assert units == "pixel"
    w = LandmarksWidget(cosmx_sdata, spatial_key="global")
    assert w.raster_bin_size > 8.0
    assert w.raster_window_radius == pytest.approx(3.0 * w.raster_bin_size)


@pytest.mark.parametrize("profile", ["xsmall", "small"])
def test_pyxa_demo_slices_keep_um_bins(profile):
    sdata = read_pyxa(profile)
    table = sdata.tables["rna"]
    units = infer_obsm_spatial_units(table, spatial_key="spatial", sdata=sdata)
    assert units == "micrometer"
    w = LandmarksWidget(sdata)
    assert w.raster_bin_size == pytest.approx(8.0)
    assert w.raster_window_radius == pytest.approx(24.0)


def test_pyxa_metadata_beats_wide_um_spacing():
    sdata = read_pyxa("xsmall")
    table = sdata.tables["rna"].copy()
    table.obsm["spatial"] = np.asarray(table.obsm["spatial"], dtype=np.float64) * 10.0
    import spatialdata as sd

    stretched = sd.SpatialData(
        tables={"rna": table},
        images=dict(sdata.images),
        labels=dict(sdata.labels),
    )
    stretched.attrs.update(sdata.attrs)
    w = LandmarksWidget(stretched)
    assert w.raster_bin_size == pytest.approx(8.0)


def test_fallback_heuristic_scales_pixel_like_coordinates():
    adata = adata_xy(
        [5100.0, 5200.0, 5300.0, 10100.0],
        [200.0, 400.0, 600.0, 200.0],
        color=["A", "A", "A", "B"],
        color_key="cell_class",
    )
    assert infer_obsm_spatial_units(adata) is None
    w = LandmarksWidget(adata, color="cell_class")
    assert w.raster_bin_size > 50.0
    assert w.raster_window_radius == pytest.approx(3.0 * w.raster_bin_size)


def test_sparse_um_grid_stays_on_fixed_bins_without_metadata():
    xs = np.arange(0.0, 500.0, 50.0)
    ys = np.arange(0.0, 500.0, 50.0)
    xx, yy = np.meshgrid(xs, ys)
    adata = adata_xy(xx.ravel(), yy.ravel())
    assert infer_obsm_spatial_units(adata) is None
    bin_size, window = default_raster_scales(
        adata.obsm["spatial"][:, 0], adata.obsm["spatial"][:, 1]
    )
    assert bin_size == pytest.approx(8.0)
    assert window == pytest.approx(24.0)
    w = LandmarksWidget(adata)
    assert w.raster_bin_size == pytest.approx(8.0)


def test_millimeter_ngff_axes_fall_back_to_spacing_heuristic():
    axes = [
        {"name": "y", "type": "space", "unit": "millimeter"},
        {"name": "x", "type": "space", "unit": "millimeter"},
    ]
    assert _units_from_ngff_axes(axes) is None
    xs = np.arange(0.0, 500.0, 50.0)
    ys = np.arange(0.0, 500.0, 50.0)
    xx, yy = np.meshgrid(xs, ys)
    bin_size, window = default_raster_scales(xx.ravel(), yy.ravel(), units=None)
    assert bin_size == pytest.approx(8.0)
    assert window == pytest.approx(24.0)


def test_non_dict_spatialdata_attrs_does_not_raise():
    adata = adata_xy([0.0, 1.0, 2.0], [0.0, 1.0, 2.0])
    adata.uns["spatialdata_attrs"] = "not-a-dict"
    assert infer_obsm_spatial_units(adata) is None
    LandmarksWidget(adata)


def test_get_transformation_errors_fall_back_to_heuristic(monkeypatch):
    from milume.spatial_units import _units_from_element_to_cs

    def boom(*_args, **_kwargs):
        raise RuntimeError("transform lookup failed")

    monkeypatch.setattr(
        "spatialdata.transformations.get_transformation",
        boom,
    )
    assert _units_from_element_to_cs(object(), "global") is None

    adata = adata_xy(
        [5100.0, 5200.0, 5300.0, 10100.0],
        [200.0, 400.0, 600.0, 200.0],
        color=["A", "A", "A", "B"],
        color_key="cell_class",
        uns={"spatialdata_attrs": {"region": "cell_labels"}},
    )

    class BrokenLabels:
        def __contains__(self, _name):
            return True

        def __getitem__(self, _name):
            return object()

    class FakeSdata:
        attrs = {}
        coordinate_systems = ["global"]
        labels = BrokenLabels()
        images = {}
        shapes = {}

    assert infer_obsm_spatial_units(adata, sdata=FakeSdata()) is None
    w = LandmarksWidget(adata, color="cell_class")
    assert w.raster_bin_size > 50.0
