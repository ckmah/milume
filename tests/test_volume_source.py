import numpy as np
import pytest

pytest.importorskip("spatialdata")

from milume.volume_source import resolve_volume
from tests.helpers import toy_spatialdata


@pytest.fixture
def sdata(tmp_path):
    return toy_spatialdata(tmp_path / "toy.zarr")


def test_infers_table_labels_image_and_frame(sdata):
    adata, src = resolve_volume(sdata)
    assert adata is sdata.tables["table"]
    assert src.image == "mosaic"
    assert src.labels == "cells"
    assert src.shape_zyx == (64, 256, 256)
    assert src.voxel_size_um == (1.0, 1.0, 1.0)
    assert src.origin_um == (0.0, 0.0, 0.0)
    np.testing.assert_array_equal(src.label_ids, adata.obs["cell_id"].to_numpy())


def test_overrides_and_opt_out(sdata):
    _, src = resolve_volume(sdata, labels="cells", image="mosaic", table="table")
    assert src.image == "mosaic"
    with pytest.warns(UserWarning, match="no 3D image"):
        _, none = resolve_volume(sdata, image=False)
    assert none is None


def test_in_memory_sdata_has_no_cube(sdata):
    import spatialdata as sd

    mem = sd.SpatialData(images=dict(sdata.images), labels=dict(sdata.labels), tables=dict(sdata.tables))
    with pytest.warns(UserWarning, match="not backed"):
        adata, src = resolve_volume(mem)
    assert src is None and adata.n_obs == sdata.tables["table"].n_obs


def test_several_tables_need_a_name(sdata):
    sdata.tables["other"] = sdata.tables["table"].copy()
    with pytest.raises(ValueError, match="table="):
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
