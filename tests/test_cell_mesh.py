"""Prototype cell meshes: holes, splits, packing, comm route."""

import numpy as np
import pytest
import shapely

from milume.cell_mesh import MeshParams, mesh_cell, pack_mesh, unpack_mesh


def ring(cx, cy, r, n=48):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.column_stack([cx + r * np.cos(t), cy + r * np.sin(t)])


def section_has_point(mesh, x, y, z):
    """Odd crossings of a +x ray from (x, y) through the mesh at height z: inside."""
    P = mesh.positions.astype(np.float64)
    T = mesh.indices.reshape(-1, 3)
    hits = 0
    for tri in T:
        d = P[tri, 2] - z
        if (d > 0).all() or (d < 0).all():
            continue
        pts = []
        for a, b in ((0, 1), (1, 2), (2, 0)):
            if (d[a] > 0) != (d[b] > 0):
                t = d[a] / (d[a] - d[b])
                pts.append(P[tri[a], :2] + t * (P[tri[b], :2] - P[tri[a], :2]))
        if len(pts) != 2:
            continue
        (x1, y1), (x2, y2) = pts
        if (y1 > y) != (y2 > y):
            xc = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xc > x:
                hits += 1
    return hits % 2 == 1


P = MeshParams(stride=1, smooth_iters=0)


def test_hole_stays_open():
    donut = shapely.Polygon(ring(0, 0, 5), [ring(0, 0, 2)[::-1]])
    m = mesh_cell([(z * 0.5, donut) for z in range(8)], P)
    assert m.stats.hole_tubes == 1
    assert not section_has_point(m, 0, 0, 1.75)  # in the hole
    assert section_has_point(m, 3.5, 0, 1.75)  # in the wall


def test_split_pieces_are_kept():
    two = shapely.MultiPolygon([shapely.Polygon(ring(-6, 0, 3)), shapely.Polygon(ring(6, 0, 2))])
    one = shapely.Polygon(ring(0, 0, 8))
    m = mesh_cell([(0.0, one), (0.5, one), (1.0, two), (1.5, two), (2.0, two)], P)
    assert m.stats.chains == 3
    assert section_has_point(m, 6, 0, 1.5)  # the smaller piece polyrender dropped
    assert section_has_point(m, -6, 0, 1.5)
    assert section_has_point(m, 0, 0, 0.25)
    pr = mesh_cell([(0.0, one), (0.5, one), (1.0, two), (1.5, two), (2.0, two)], MeshParams(stride=1, smooth_iters=0, polyrender_rule=True))
    assert not section_has_point(pr, 6, 0, 1.5)


def test_single_slice_piece_is_a_slab():
    m = mesh_cell([(1.0, shapely.Polygon(ring(0, 0, 3)))], P)
    assert m.stats.slabs == 1 and m.n_triangles > 0
    assert section_has_point(m, 0, 0, 1.1)


def test_pack_roundtrip():
    a = mesh_cell([(z * 0.5, shapely.Polygon(ring(0, 0, 4))) for z in range(4)], P)
    b = mesh_cell([(z * 0.5, shapely.Polygon(ring(20, 0, 4))) for z in range(4)], P)
    buf = pack_mesh([a, b], [7, 9], origin=(10.0, -5.0, 0.0))
    u = unpack_mesh(buf)
    assert u["labels"].tolist() == [7, 9]
    assert u["header"]["vertices"] == len(a.positions) + len(b.positions)
    assert set(np.unique(u["cells"])) == {0, 1}
    np.testing.assert_allclose(u["positions"][0], a.positions[0] - np.array([10, -5, 0], np.float32))
    assert u["indices"].max() < u["header"]["vertices"]


def test_comm_route():
    gpd = pytest.importorskip("geopandas")
    from milume.landmarks import LandmarksWidget

    w = LandmarksWidget.__new__(LandmarksWidget)
    shapes = gpd.GeoDataFrame(
        {"cell_id": ["a"] * 3, "Z_um": [0.25, 0.75, 1.25]},
        geometry=[shapely.Polygon(ring(5, 5, 2))] * 3,
    )
    from milume.cell_mesh import CellMeshCache

    w._cell_mesh_cache = CellMeshCache(shapes.cell_id.to_numpy(), shapes.Z_um.to_numpy(), shapes.geometry.to_numpy(), {"a": 3})
    reply, bufs = w._cell_mesh_reply({"path": "cellmesh/0,0,10,10.bin"})
    assert reply["ok"] and unpack_mesh(bufs[0])["labels"].tolist() == [3]
    assert w._cell_mesh_reply({"path": "images/x/zarr.json"}) is None


def test_recolour_keeps_mesh_geometry(tmp_path):
    """`w.color = <other column>` only re-syncs colour traits; the mesh cache and bytes stay."""
    gpd = pytest.importorskip("geopandas")
    from milume import LandmarksWidget
    from tests.helpers import toy_spatialdata

    sdata = toy_spatialdata(tmp_path / "toy.zarr")
    table = sdata.tables[next(iter(sdata.tables))]
    table.obs["half"] = (table.obs["cell_type"].astype(str) == "type0").map({True: "a", False: "b"}).astype("category")
    w = LandmarksWidget(sdata, color="cell_type")
    shapes = gpd.GeoDataFrame(
        {"cell_id": ["a"] * 3, "Z_um": [0.25, 0.75, 1.25]},
        geometry=[shapely.Polygon(ring(5, 5, 2))] * 3,
    )
    w._attach_cell_meshes(shapes, {"a": 1})
    cache, volume = w._cell_mesh_cache, dict(w.volume)
    before = w._cell_mesh_reply({"path": "cellmesh/0,0,10,10.bin"})[1][0]
    w.color = "half"
    assert w.active_category == "half"
    assert w._cell_mesh_cache is cache and w.volume == volume
    assert w._cell_mesh_reply({"path": "cellmesh/0,0,10,10.bin"})[1][0] == before
