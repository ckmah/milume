import base64

import numpy as np
import pytest
import traitlets

from milume import LandmarksWidget
from milume.landmarks import _PUBLIC_TRAITS
from tests.helpers import adata_xy


def _adata():
    adata = adata_xy(
        [0.0, 1.0, 2.0, 3.0],
        [0.0, 1.0, 0.0, 1.0],
        color=["Epi", "Imm", "Epi", "Fib"],
        color_key="cell_class",
        genes={"Apob": [0.0, 1.0, 2.0, 4.0], "Lgr5": [0.0, 0.0, 0.5, 1.0]},
    )
    adata.obs["region"] = ["top", "top", "bottom", "bottom"]
    adata.obs["area"] = [10.0, 20.0, 30.0, 40.0]
    return adata


def _sends(w, monkeypatch):
    calls = []
    monkeypatch.setattr(w, "send_state", lambda key=None: calls.append(key))
    return calls


def _codes(w):
    n = len(w._data_x)
    raw = np.frombuffer(base64.b64decode(w.category_codes), dtype=np.int32)
    return raw.reshape(len(w.category_columns), n)


def test_categorical_obs_column_recolours_in_one_sync(monkeypatch):
    w = LandmarksWidget(_adata(), color="cell_class")
    calls = _sends(w, monkeypatch)
    w.color = "region"
    assert len(calls) == 1
    assert w.active_category == "region"
    assert w.color_mode == "categorical"
    assert w.legend_title == "region"
    assert w.legend_labels == ["top", "bottom"]
    assert list(w.category_colors("region").values()) == w.point_palette


def test_numeric_obs_column_shows_a_sequential_ramp():
    w = LandmarksWidget(_adata())
    w.color = "area"
    assert w.color_mode == "obs"
    assert w.legend_title == "area"
    assert w.active_category == ""
    assert len(w.point_palette) == 256
    points = np.frombuffer(base64.b64decode(w.points_data), dtype=np.float32).reshape(4, 4)
    assert points[0, 2] == 0.0 and points[-1, 2] == 1.0
    assert np.all(np.diff(points[:, 2]) > 0)


def test_gene_recolours_in_one_sync(monkeypatch):
    w = LandmarksWidget(_adata(), color="cell_class")
    calls = _sends(w, monkeypatch)
    w.color = "Apob"
    assert len(calls) == 1
    assert w.active_genes == ["Apob"]
    assert w.color_mode == "continuous"
    assert w.legend_title == "Apob"
    assert w.active_category == ""


def test_constructor_color_goes_through_the_trait():
    assert LandmarksWidget(_adata(), color="Lgr5").active_genes == ["Lgr5"]
    assert LandmarksWidget(_adata(), color="area").color_mode == "obs"
    w = LandmarksWidget(_adata(), color="region")
    assert (w.color, w.active_category) == ("region", "region")


@pytest.mark.parametrize("key", ["nope", "Nope"])
def test_unknown_key_raises_before_any_trait_changes(key):
    w = LandmarksWidget(_adata(), color="cell_class")
    before = {name: getattr(w, name) for name in w.trait_names(sync=True)}
    with pytest.raises(KeyError, match=key):
        w.color = key
    assert {name: getattr(w, name) for name in w.trait_names(sync=True)} == before


def test_unpacked_gene_raises_value_error():
    w = LandmarksWidget(_adata(), genes=["Apob"])
    with pytest.raises(ValueError, match="Lgr5"):
        w.color = "Lgr5"
    assert w.color == ""


def test_column_added_after_construct_can_be_shown():
    adata = _adata()
    w = LandmarksWidget(adata, color="cell_class")
    adata.obs["leiden"] = ["0", "1", "1", "0"]
    w.color = "leiden"
    assert w.active_category == "leiden"
    assert w.legend_labels == ["0", "1"]
    codes = _codes(w)
    assert [c["name"] for c in w.category_columns][-1] == "leiden"
    assert codes[-1].tolist() == [0, 1, 1, 0]


def test_rewritten_column_is_repacked():
    adata = _adata()
    w = LandmarksWidget(adata, color="region")
    adata.obs["region"] = ["a", "b", "c", "a"]
    w.color = "cell_class"
    w.color = "region"
    assert w.legend_labels == ["a", "b", "c"]
    idx = [c["name"] for c in w.category_columns].index("region")
    assert _codes(w)[idx].tolist() == [0, 1, 2, 0]


def test_browser_write_is_validated():
    w = LandmarksWidget(_adata(), color="cell_class")
    with pytest.raises(KeyError):
        w.set_state({"color": "nope"})
    assert w.color == "cell_class"
    w.set_state({"color": "Apob"})
    assert w.active_genes == ["Apob"]


def test_public_registry_entries_exist_on_the_class():
    assert "color" in _PUBLIC_TRAITS
    assert "set_color" not in _PUBLIC_TRAITS and "color_by" not in _PUBLIC_TRAITS
    traits = LandmarksWidget.class_traits()
    for name, doc in _PUBLIC_TRAITS.items():
        assert doc and "\n" not in doc
        member = getattr(LandmarksWidget, name)
        assert name in traits or callable(member), name
        if name in traits:
            assert isinstance(traits[name], traitlets.TraitType)
            assert traits[name].metadata.get("sync") is True
