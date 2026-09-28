import numpy as np
import pandas as pd
import pytest

geopandas = pytest.importorskip("geopandas")
pytest.importorskip("shapely")


def _adata():
    import anndata as ad

    obs = pd.DataFrame(
        {"cell_type": ["a", "a", "b", "b"], "cell_class": ["X", "X", "Y", "Y"]},
        index=["c0", "c1", "c2", "c3"],
    )
    adata = ad.AnnData(np.ones((4, 1)), obs=obs)
    adata.obsm["spatial"] = np.array(
        [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]]
    )
    return adata


def _gdf(landmarks):
    from spatial_rx import landmarks_to_geodataframe

    return landmarks_to_geodataframe(landmarks)


def test_distances_to_a_line_by_group_written_to_obs():
    from spatial_rx.measure import distances, write_obs

    adata = _adata()
    gdf = _gdf(
        [
            {
                "id": "axis",
                "type": "line",
                "vertices": [[0.0, -1.0], [0.0, 2.0]],
                "buffer_width": 0,
            }
        ]
    )
    df = distances(adata, gdf, obs_key="cell_type").set_index("obs_name")
    assert df["distance"].to_dict() == pytest.approx({"c0": 0.0, "c1": 1.0, "c2": 0.0, "c3": 1.0})
    assert df["group"].to_dict() == {"c0": "a", "c1": "a", "c2": "b", "c3": "b"}
    by_class = distances(adata, gdf, obs_key="cell_class")
    assert set(by_class["group"]) == {"X", "Y"}
    write_obs(adata, df.reset_index(), "dist_axis", "distance")
    assert adata.obs["dist_axis"].tolist() == pytest.approx([0.0, 1.0, 0.0, 1.0])


def test_composition_counts_groups_inside_a_shape():
    from spatial_rx.measure import composition

    adata = _adata()
    gdf = _gdf(
        [
            {
                "id": "box",
                "type": "shape",
                "vertices": [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
                "tension": 0.0,
            }
        ]
    )
    df = composition(adata, gdf, obs_key="cell_type", obs_names=["c0", "c1"])
    assert df[["group", "count", "proportion", "n_total"]].to_dict("records") == [
        {"group": "a", "count": 1, "proportion": 1.0, "n_total": 1}
    ]


def test_along_positions_gives_fractional_position_on_the_line():
    from spatial_rx.measure import along_positions, write_obs

    adata = _adata()
    gdf = _gdf(
        [
            {
                "id": "path",
                "type": "line",
                "vertices": [[-1.0, 0.0], [2.0, 0.0]],
                "buffer_width": 2.0,
                "buffer_side": "both",
            }
        ]
    )
    df = along_positions(adata, gdf, obs_key="cell_type")
    write_obs(adata, df, "path_s", "s")
    assert adata.obs["path_s"].tolist() == pytest.approx([1 / 3, 2 / 3, 1 / 3, 2 / 3])


def _adata_3d():
    import anndata as ad

    obs = pd.DataFrame(
        {"cell_type": ["seed", "seed", "near", "stacked", "far"]},
        index=["s0", "s1", "n0", "z0", "f0"],
    )
    adata = ad.AnnData(np.ones((5, 1)), obs=obs)
    # n0 sits beside s0 in 3D; z0 is on top of s0 in XY but 40 µm below it.
    adata.obsm["spatial"] = np.array(
        [
            [0.0, 0.0, 10.0],
            [100.0, 0.0, 10.0],
            [3.0, 0.0, 10.0],
            [0.0, 1.0, 50.0],
            [50.0, 50.0, 10.0],
        ]
    )
    return adata


def test_enrichment_against_all_cells():
    from spatial_rx import enrichment

    adata = _adata_3d()
    out = enrichment(adata, ["s0", "n0"], obs_key="cell_type")
    assert list(out["group"]) == ["near", "seed"]  # near: 1/2 vs 1/5
    near = out.iloc[0]
    assert near["count"] == 1
    assert near["proportion"] == pytest.approx(0.5)
    assert near["background_proportion"] == pytest.approx(0.2)
    assert near["log2_enrichment"] == pytest.approx(np.log2(2.5))
    assert enrichment(adata, [], obs_key="cell_type").empty


def test_nearest_distances_separates_xy_from_depth():
    from spatial_rx import nearest_distances

    adata = _adata_3d()
    out = nearest_distances(adata, ["s0", "s1"], obs_key="cell_type").set_index("obs_name")
    assert out.loc["n0", "distance_xy"] == pytest.approx(3.0)
    assert out.loc["n0", "distance_xyz"] == pytest.approx(3.0)
    # On top of s0 on the map, 40 µm away in depth.
    assert out.loc["z0", "distance_xy"] == pytest.approx(1.0)
    assert out.loc["z0", "dz"] == pytest.approx(40.0)
    assert out.loc["z0", "distance_xyz"] == pytest.approx(np.hypot(1.0, 40.0))
    # A seed measures to the other seed, not itself.
    assert bool(out.loc["s0", "seed"])
    assert out.loc["s0", "distance_xy"] == pytest.approx(100.0)
    only = nearest_distances(adata, ["s0"], obs_key="cell_type", obs_names=["f0"])
    assert list(only["obs_name"]) == ["f0"]


def test_nearest_distances_needs_z():
    from spatial_rx import nearest_distances

    with pytest.raises(ValueError, match="x, y, z"):
        nearest_distances(_adata(), ["c0"], obs_key="cell_type")


def _adata_z():
    import anndata as ad

    obs = pd.DataFrame(
        {"cell_type": ["a", "b", "a", "b"]},
        index=["c0", "c1", "c2", "c3"],
    )
    adata = ad.AnnData(np.ones((4, 1)), obs=obs)
    # Same XY as _adata(); c0 and c1 share the 10–11 µm bin, c2 and c3 sit at 12 µm.
    adata.obsm["spatial"] = np.array(
        [[0.0, 0.0, 10.2], [1.0, 0.0, 10.9], [0.0, 1.0, 12.5], [1.0, 1.0, 12.0]]
    )
    return adata


def _line(**extra):
    return _gdf(
        [
            {
                "id": "path",
                "type": "line",
                "vertices": [[-1.0, 0.0], [2.0, 0.0]],
                "buffer_width": 2.0,
                **extra,
            }
        ]
    )


def test_distances_add_z_bins_and_keep_the_xy_distance():
    from spatial_rx.measure import distances

    df = distances(_adata_z(), _line(), obs_key="cell_type").set_index("obs_name")
    assert df["distance"].to_dict() == pytest.approx({"c0": 0.0, "c1": 0.0, "c2": 1.0, "c3": 1.0})
    assert df["z"].to_dict() == pytest.approx({"c0": 10.2, "c1": 10.9, "c2": 12.5, "c3": 12.0})
    assert df["z_bin"].to_dict() == {"c0": 10.0, "c1": 10.0, "c2": 12.0, "c3": 12.0}


def test_z_bin_size_sets_the_bin_width_and_none_turns_it_off():
    from spatial_rx.measure import along_positions, distances

    wide = distances(_adata_z(), _line(), obs_key="cell_type", z_bin_size=5.0)
    assert set(wide["z_bin"]) == {10.0}
    flat = along_positions(_adata_z(), _line(), obs_key="cell_type", z_bin_size=None)
    assert "z_bin" not in flat.columns and "z" not in flat.columns
    assert flat["s"].tolist() == pytest.approx([1 / 3, 2 / 3, 1 / 3, 2 / 3])


def test_along_positions_add_z_bins():
    from spatial_rx.measure import along_positions

    df = along_positions(_adata_z(), _line(), obs_key="cell_type")
    assert df["z_bin"].tolist() == [10.0, 10.0, 12.0, 12.0]


def test_2d_coordinates_have_no_z_columns():
    from spatial_rx.measure import along_positions, composition, distances

    adata = _adata()
    for fn in (distances, along_positions, composition):
        df = fn(adata, _line(), obs_key="cell_type")
        assert not df.empty
        assert "z_bin" not in df.columns


def test_composition_per_z_bin():
    from spatial_rx.measure import composition

    df = composition(_adata_z(), _line(), obs_key="cell_type", obs_names=["c0", "c1", "c2"])
    assert df[["z_bin", "group", "count", "proportion", "n_total"]].to_dict("records") == [
        {"z_bin": 10.0, "group": "a", "count": 1, "proportion": 0.5, "n_total": 2},
        {"z_bin": 10.0, "group": "b", "count": 1, "proportion": 0.5, "n_total": 2},
        {"z_bin": 12.0, "group": "a", "count": 1, "proportion": 1.0, "n_total": 1},
    ]
