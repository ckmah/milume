"""SpatialData ingestion beyond Pyxa: positions from elements, coordinate systems, regions."""

from __future__ import annotations

import warnings

import numpy as np
import pytest

pytest.importorskip("spatialdata")

from spatialdata.transformations import Affine, Identity, Scale, Sequence, Translation

from milume import LandmarksWidget
from tests.helpers import circles_sdata

SQUARE = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]


def _xy(w):
    return np.column_stack([w._data_x, w._data_y])


def _select_around(w, x, y, half=1.0):
    """Select a box in data coordinates (the widget's selection geometry is in data units)."""
    w.selections = [
        {
            "id": "s",
            "type": "polygon",
            "vertices": [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]],
        }
    ]


def test_cells_sit_at_the_centroids_of_the_annotated_elements():
    """No obsm["spatial"]: positions come from the elements (MERFISH, Xenium, Visium HD, SpaceM)."""
    sdata = circles_sdata({"cells": {"centers": [[10, 20], [30, 40], [50, 60]]}})
    assert "spatial" not in sdata.tables["table"].obsm
    w = LandmarksWidget(sdata, color="cell_type")
    np.testing.assert_allclose(_xy(w), [[10, 20], [30, 40], [50, 60]])
    assert w.coordinate_system == "global"
    _select_around(w, 30, 40)
    assert list(w.get_obs_names(selection_id="s")) == ["cells-2"]


def test_positions_are_in_the_chosen_coordinate_system():
    systems = {
        "global": Identity(),
        "um": Sequence([Scale([2, 3], axes=("x", "y")), Translation([10, -50], axes=("x", "y"))]),
        "affine": Affine([[10, 20, 30], [40, 50, 60], [0, 0, 1]], input_axes=("x", "y"), output_axes=("x", "y")),
    }
    sdata = circles_sdata({"cells": {"centers": [[1, 1], [2, 5]], "systems": systems}})
    w = LandmarksWidget(sdata, coordinate_system="um")
    np.testing.assert_allclose(_xy(w), [[12, -47], [14, -35]])
    w = LandmarksWidget(sdata, coordinate_system="affine")
    np.testing.assert_allclose(_xy(w)[:, 0], [10 * 1 + 20 * 1 + 30, 10 * 2 + 20 * 5 + 30])
    assert w.coordinate_system == "affine"
    assert LandmarksWidget(sdata).coordinate_system == "global"


def test_existing_obsm_spatial_is_used_and_never_overwritten():
    sdata = circles_sdata({"cells": {"centers": [[10, 20], [30, 40]]}}, obsm=True)
    np.testing.assert_allclose(_xy(LandmarksWidget(sdata)), -7.0)  # the table's own obsm wins
    table = sdata.tables["table"]
    assert (table.obsm["spatial"] == -7.0).all()
    w = LandmarksWidget(sdata, spatial_key=None)  # force element centroids
    np.testing.assert_allclose(_xy(w), [[10, 20], [30, 40]])
    assert (table.obsm["spatial"] == -7.0).all()


def test_derived_positions_are_stored_for_downstream_helpers():
    sdata = circles_sdata({"cells": {"centers": [[10, 20], [30, 40]]}})
    LandmarksWidget(sdata)
    np.testing.assert_allclose(sdata.tables["table"].obsm["spatial"], [[10, 20], [30, 40]])


def test_stored_positions_follow_the_coordinate_system_of_the_latest_widget():
    systems = {"global": Identity(), "um": Scale([2, 2], axes=("x", "y"))}
    sdata = circles_sdata({"cells": {"centers": [[1, 1], [2, 5]], "systems": systems}})
    LandmarksWidget(sdata, coordinate_system="um")
    np.testing.assert_allclose(_xy(LandmarksWidget(sdata, coordinate_system="global")), [[1, 1], [2, 5]])
    np.testing.assert_allclose(sdata.tables["table"].obsm["spatial"], [[1, 1], [2, 5]])


def test_several_fovs_in_their_own_coordinate_systems():
    """MIBI-TOF: one table, one element per FOV, each in its own coordinate system."""
    sdata = circles_sdata(
        {
            "fov1": {"centers": [[1, 1], [2, 2], [3, 3]], "systems": {"fov1": Identity()}},
            "fov2": {"centers": [[100, 100], [200, 200]], "systems": {"fov2": Identity()}},
        }
    )
    with pytest.warns(UserWarning, match="different coordinate systems.*'fov1' \\(3 of 5.*'fov2' \\(2\\)"):
        w = LandmarksWidget(sdata)
    assert w.coordinate_system == "fov1" and len(w._adata) == 3
    w = LandmarksWidget(sdata, coordinate_system="fov2")
    assert len(w._adata) == 2 and _xy(w)[:, 0].tolist() == [100.0, 200.0]
    with pytest.raises(ValueError, match="available"):
        LandmarksWidget(sdata, coordinate_system="nope")


def test_a_shared_global_system_shows_every_fov_without_a_warning():
    sdata = circles_sdata(
        {
            "fov1": {"centers": [[1, 1], [2, 2]], "systems": {"global": Identity(), "fov1": Identity()}},
            "fov2": {"centers": [[100, 100]], "systems": {"global": Translation([5, 5], axes=("x", "y"))}},
        }
    )
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        w = LandmarksWidget(sdata)
    assert w.coordinate_system == "global" and len(w._adata) == 3
    assert _xy(w)[:, 0].tolist() == [1.0, 2.0, 105.0]


def test_region_picks_some_of_the_annotated_elements():
    sdata = circles_sdata({"a": {"centers": [[0, 0], [1, 1]]}, "b": {"centers": [[5, 5], [9, 9]]}})
    w = LandmarksWidget(sdata, region="b")
    assert list(w._adata.obs_names) == ["b-1", "b-2"] and _xy(w)[:, 0].tolist() == [5.0, 9.0]
    w = LandmarksWidget(sdata, region=["a", "b"])
    assert len(w._adata) == 4
    with pytest.raises(ValueError, match="annotates \\['a', 'b'\\]"):
        LandmarksWidget(sdata, region="c")


def test_selection_hits_join_back_to_the_full_table_by_name():
    sdata = circles_sdata(
        {
            "fov1": {"centers": [[1, 1], [2, 2]], "systems": {"fov1": Identity()}},
            "fov2": {"centers": [[1, 1], [2, 2], [3, 3]], "systems": {"fov2": Identity()}},
        }
    )
    w = LandmarksWidget(sdata, coordinate_system="fov2")
    _select_around(w, 2, 2, half=0.5)
    table = sdata.tables["table"]
    assert list(w.get_obs_names(table, selection_id="s")) == ["fov2-2"]  # full table passed: still by name
    w.assign_obs_mask(table, "in_sel", selection_id="s")
    assert table.obs["in_sel"].sum() == 1 and bool(table.obs.loc["fov2-2", "in_sel"])


def test_cells_without_an_instance_are_left_out_with_a_warning():
    sdata = circles_sdata({"cells": {"centers": [[10, 20], [30, 40], [50, 60]]}})
    sdata.tables["table"].obs.loc["cells-1", "cell_id"] = 99  # no such shape
    with pytest.warns(UserWarning, match="1 of 3 cells have no matching instance"):
        w = LandmarksWidget(sdata)
    assert list(w._adata.obs_names) == ["cells-2", "cells-3"]
    assert _xy(w)[:, 0].tolist() == [30.0, 50.0]


def test_instance_ids_match_whatever_their_dtype():
    sdata = circles_sdata({"cells": {"centers": [[10, 20], [30, 40]]}})
    obs = sdata.tables["table"].obs
    obs["cell_id"] = obs["cell_id"].astype(np.int64)
    assert _xy(LandmarksWidget(sdata))[:, 0].tolist() == [10.0, 30.0]


def test_several_tables_name_what_they_annotate():
    sdata = circles_sdata({"cells": {"centers": [[0, 0], [1, 1]]}}, extra_tables=True)
    with pytest.raises(ValueError, match="annotates \\['cells'\\].*table="):
        LandmarksWidget(sdata)
    assert LandmarksWidget(sdata, table="other").coordinate_system == "global"
    with pytest.raises(ValueError, match="no table 'nope'"):
        LandmarksWidget(sdata, table="nope")


def test_labels_annotated_tables_use_label_centroids():
    from spatialdata.datasets import blobs

    sdata = blobs()  # table annotates blobs_labels, has no obsm["spatial"]
    table = sdata.tables["table"]
    w = LandmarksWidget(sdata, color="region")
    assert len(w._adata) == table.n_obs
    xy = table.obsm["spatial"]
    assert np.isfinite(xy).all() and xy.min() >= 0 and xy.max() <= 512
    assert w.coordinate_system == "global"


def test_a_2d_sdata_widget_is_quiet_and_has_no_cube(recwarn):
    sdata = circles_sdata({"cells": {"centers": [[0, 0], [1, 1]]}})
    w = LandmarksWidget(sdata)
    assert w.volume == {}
    assert not [x for x in recwarn if issubclass(x.category, UserWarning)]


def test_label_centroids_follow_the_labels_transformations():
    """The storage-format fixture: one labels element in scale / translation / affine systems."""
    from spatialdata.datasets import blobs
    from spatialdata.transformations import set_transformation

    scale = Scale([2, 3], axes=("x", "y"))
    translation = Translation([10, -50], axes=("x", "y"))
    sdata = blobs()
    set_transformation(
        sdata["blobs_labels"],
        {
            "global": Identity(),
            "scale": scale,
            "translation": translation,
            "affine": Affine([[10, 20, 30], [40, 50, 60], [0, 0, 1]], input_axes=("x", "y"), output_axes=("x", "y")),
            "sequence": Sequence([scale, translation]),
        },
        set_all=True,
    )
    base = _xy(LandmarksWidget(sdata, coordinate_system="global"))
    np.testing.assert_allclose(_xy(LandmarksWidget(sdata, coordinate_system="scale")), base * [2, 3])
    np.testing.assert_allclose(_xy(LandmarksWidget(sdata, coordinate_system="translation")), base + [10, -50])
    np.testing.assert_allclose(
        _xy(LandmarksWidget(sdata, coordinate_system="affine")), base @ np.array([[10, 20], [40, 50]]).T + [30, 60]
    )
    np.testing.assert_allclose(_xy(LandmarksWidget(sdata, coordinate_system="sequence")), base * [2, 3] + [10, -50])
