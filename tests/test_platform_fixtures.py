"""Fixture sanity for #103: the tiny Xenium/CosMx data read through spatialdata-io.

Widget-level assertions belong to the #103 loader PR; this only pins the fixture shape.
"""

from __future__ import annotations

import numpy as np
from tests.platform_fixtures import read_cosmx, read_xenium


def test_cosmx_fixture_reads():
    sd = read_cosmx()
    t = sd.tables["table"]
    assert t.shape[0] == 6
    attrs = t.uns["spatialdata_attrs"]
    assert sorted(attrs["region"]) == ["1_labels", "2_labels"]
    assert attrs["instance_key"] == "cell_ID"
    assert {"global", "spatial"} <= set(t.obsm)
    assert np.issubdtype(t.obsm["spatial"].dtype, np.integer)  # local px (#103 item 2)
    assert set(sd.labels) == {"1_labels", "2_labels"}
    assert all(sd.labels[k].dims == ("y", "x") for k in sd.labels)


def test_xenium_fixture_reads():
    sd = read_xenium()
    t = sd.tables["table"]
    assert t.shape[0] == 632
    assert t.uns["spatialdata_attrs"]["region"] == "cell_labels"
    assert "spatial" in t.obsm
    assert sd.images["morphology_focus"]["scale0"].image.dims == ("c", "y", "x")
