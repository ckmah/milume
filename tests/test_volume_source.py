import numpy as np
import pytest

pytest.importorskip("spatialdata")

from milume.volume_source import image_contrast_limits, resolve_volume
from tests.helpers import toy_spatialdata


@pytest.fixture
def sdata(tmp_path):
    return toy_spatialdata(tmp_path / "toy.zarr")


def test_infers_table_image_cell_polygons_and_frame(sdata):
    adata, src = resolve_volume(sdata)
    assert adata is sdata.tables["table"]
    assert src.image == "mosaic"
    assert src.shapes == "cell_polygons"
    assert src.shape_zyx == (64, 256, 256)
    assert src.voxel_size_um == (1.0, 1.0, 1.0)
    assert src.origin_um == (0.0, 0.0, 0.0)
    assert src.is_3d is True
    assert src.dims == ("c", "z", "y", "x")
    assert src.coordinate_system == "global"
    np.testing.assert_array_equal(src.cell_rows, np.arange(adata.n_obs))


def test_overrides_and_opt_out(sdata):
    _, src = resolve_volume(sdata, shapes="cell_polygons", image="mosaic", table="table")
    assert src.image == "mosaic"
    assert resolve_volume(sdata, shapes=False)[1].shapes is None
    _, none = resolve_volume(sdata, image=False)
    assert none is None


def test_several_3d_images_auto_pick_with_warning(sdata):
    sdata.images["other"] = sdata.images["mosaic"]
    with pytest.warns(UserWarning, match="picked.*skipped.*pass image="):
        adata, src = resolve_volume(sdata)
    assert src is not None and src.image == "mosaic" and adata is sdata.tables["table"]
    _, src = resolve_volume(sdata, image="mosaic")
    assert src.image == "mosaic"


def test_in_memory_sdata_has_no_cube(sdata):
    import spatialdata as sd

    mem = sd.SpatialData(images=dict(sdata.images), labels=dict(sdata.labels), tables=dict(sdata.tables))
    with pytest.warns(UserWarning, match="not backed"):
        adata, src = resolve_volume(mem)
    assert src is None and adata.n_obs == sdata.tables["table"].n_obs


def test_several_tables_need_a_name(sdata):
    sdata.tables["other"] = sdata.tables["table"].copy()
    with pytest.raises(ValueError, match="annotates"):
        resolve_volume(sdata)


def test_a_table_with_several_regions_is_not_the_linked_one(sdata):
    """``region`` may be a list in SpatialData; it never names the one labels element."""
    sdata.tables["other"] = other = sdata.tables["table"].copy()
    # Set after the table is added: its obs names one region, so validation would refuse it.
    other.uns["spatialdata_attrs"] = {**other.uns["spatialdata_attrs"], "region": ["cells", "nuclei"]}
    adata, src = resolve_volume(sdata)
    assert src.table_name == "table" and adata is sdata.tables["table"]


def test_toy_pyramid_levels_share_grids(sdata):
    import zarr

    root = zarr.open_group(str(sdata.path), mode="r")
    image = [root[f"images/mosaic/s{i}"].shape[-3:] for i in range(3)]
    labels = [root[f"labels/cells/s{i}"].shape for i in range(3)]
    assert image == [(64, 256, 256), (32, 128, 128), (16, 64, 64)]
    assert labels == image


def _image(values, scale_factors=None):
    from spatialdata.models import Image3DModel

    return Image3DModel.parse(values[None], dims=("c", "z", "y", "x"), scale_factors=scale_factors)


def test_contrast_limits_span_p1_to_p999():
    values = np.random.default_rng(0).integers(1000, 30000, size=(8, 32, 32), dtype=np.uint16)
    lo, hi = image_contrast_limits(_image(values))
    np.testing.assert_allclose((lo, hi), (np.percentile(values, 1), np.percentile(values, 99.9)))


def test_contrast_limits_read_the_coarsest_level():
    image = _image(np.full((8, 32, 32), 60000, dtype=np.uint16), scale_factors=[2, 2])
    coarsest = image["scale2"]
    name = next(iter(coarsest.data_vars))
    level = coarsest[name]
    ramp = np.arange(level.size, dtype=np.uint16).reshape(level.shape)
    image["scale2"] = coarsest.dataset.assign({name: level.copy(data=ramp)})
    lo, hi = image_contrast_limits(image)
    np.testing.assert_allclose((lo, hi), (np.percentile(ramp, 1), np.percentile(ramp, 99.9)))


def test_a_constant_image_still_has_a_contrast_range():
    lo, hi = image_contrast_limits(_image(np.full((4, 8, 8), 500, dtype=np.uint16)))
    assert lo <= 500 <= hi


def test_constant_zero_channel_detected():
    from spatialdata.models import Image3DModel

    from milume.volume_source import _coarsest_array, _constant_zero_channel_indices

    values = np.zeros((2, 4, 8, 8), dtype=np.uint16)
    values[1] = 10
    image = Image3DModel.parse(values, dims=("c", "z", "y", "x"))
    assert _constant_zero_channel_indices(_coarsest_array(image)) == frozenset({0})


def test_2d_image_resolves(tmp_path):
    import anndata as ad
    import spatialdata as sd
    from spatialdata.models import Image2DModel, TableModel
    from spatialdata.transformations import Identity

    table = ad.AnnData(np.ones((3, 1), dtype=np.float32))
    table.obsm["spatial"] = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
    values = np.random.default_rng(2).integers(0, 255, size=(2, 32, 48), dtype=np.uint8)
    sdata = sd.SpatialData(
        images={
            "flat": Image2DModel.parse(
                values,
                dims=("c", "y", "x"),
                transformations={"global": Identity()},
            )
        },
        tables={"table": TableModel.parse(table)},
    )
    dest = tmp_path / "flat.zarr"
    sdata.write(dest)
    sdata = sd.read_zarr(dest)
    _, src = resolve_volume(sdata)
    assert src is not None
    assert src.is_3d is False
    assert src.dims == ("c", "y", "x")
    assert src.shape_zyx == (1, 32, 48)
