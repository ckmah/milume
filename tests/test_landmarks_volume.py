import base64
from urllib.error import HTTPError
from urllib.request import urlopen

import numpy as np
import pytest

pytest.importorskip("spatialdata")

from spatial_rx import LandmarksWidget
from tests.helpers import toy_spatialdata

NEW_TRAITS = {"volume", "volume_label_ids", "volume_cut"}


@pytest.fixture
def sdata(tmp_path):
    return toy_spatialdata(tmp_path / "toy.zarr")


def test_widget_from_sdata_serves_the_volume(sdata):
    w = LandmarksWidget(sdata, color="cell_type")
    assert set(w.volume) == {"image_url", "labels_url", "voxel_size_um", "origin_um", "contrast_limits"}
    assert w.volume["voxel_size_um"] == [1.0, 1.0, 1.0]
    assert w.volume["image_url"].endswith("/images/mosaic/")
    assert w.volume["labels_url"].endswith("/labels/cells/")
    with urlopen(w.volume["image_url"] + "zarr.json") as r:  # served, NGFF metadata
        assert r.status == 200
    ids = np.frombuffer(base64.b64decode(w.volume_label_ids), dtype=np.int32)
    np.testing.assert_array_equal(ids, sdata.tables["table"].obs["cell_id"].to_numpy())
    assert w.volume_cut == [0.0, 256.0, 0.0, 256.0, 0.0, 64.0]


def _status(url):
    try:
        with urlopen(url) as r:
            return r.status
    except HTTPError as err:
        return err.code


def test_widget_serves_only_the_cube_image_and_labels(sdata):
    """The loopback server exposes the image and labels, not tables or listings."""
    w = LandmarksWidget(sdata, color="cell_type")
    image_url, labels_url = w.volume["image_url"], w.volume["labels_url"]
    base = image_url.removesuffix("images/mosaic/")
    assert (sdata.path / "tables" / "table" / "zarr.json").is_file()
    assert _status(image_url + "zarr.json") == 200
    assert _status(labels_url + "zarr.json") == 200
    assert _status(base + "tables/table/zarr.json") == 404
    assert _status(base + "zarr.json") == 404
    assert _status(image_url + "../../tables/table/zarr.json") == 404
    # Directories are never listed, inside the allowlist or not.
    assert _status(image_url) == 404
    assert _status(base) == 404
    assert _status(base + "tables/") == 404


def test_adata_widget_has_empty_volume(sdata):
    w = LandmarksWidget(sdata.tables["table"])
    assert w.volume == {} and w.volume_label_ids == ""


def test_volume_contract_is_three_synced_traits():
    synced = {n for n, t in LandmarksWidget.class_traits().items() if t.metadata.get("sync")}
    assert NEW_TRAITS <= synced
    assert not {n for n in synced if n.startswith(("volume", "cube_"))} - NEW_TRAITS
