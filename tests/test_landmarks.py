import numpy as np
import pytest

from spatial_rx import GalleryWidget, LandmarksWidget
from tests.helpers import adata_xy

SQUARE = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]


def test_widget_frames_the_points_and_colours_categories():
    x = np.array([0.0, 1.0, 2.0, 3.0])
    y = np.array([0.0, 1.0, 0.0, 1.0])
    w = LandmarksWidget(adata_xy(x, y, color=["a", "b", "a", "c"]), color="label")
    assert w.mode == "select"
    assert w.legend_labels == ["a", "b", "c"]
    assert len(w.point_palette) == 3
    assert w.x_bounds[0] < 0.0 and w.x_bounds[1] > 3.0
    assert w.y_bounds[0] < 0.0 and w.y_bounds[1] > 1.0


def test_point_size_scales_with_point_spacing():
    x = np.array([0.0, 1.0, 2.0, 3.0])
    tight = LandmarksWidget(adata_xy(x, np.zeros(4))).point_size
    loose = LandmarksWidget(adata_xy(x * 10, np.zeros(4))).point_size
    assert tight > 0
    assert loose == pytest.approx(10 * tight)


def test_set_color_continuous_categorical_and_custom_range():
    w = LandmarksWidget(adata_xy([0.0, 1.0, 2.0, 3.0], np.zeros(4)))
    w.set_color(np.array([0.1, 0.2, 0.3, 0.9]), legend_title="expr")
    assert w.color_by == "continuous"
    assert w.legend_title == "expr"
    assert w.color_vmax >= w.color_vmin
    w.set_color(
        np.array(["b", "a", "c", "a"]),
        color_map={"a": "#111111", "b": "#222222", "c": "#333333"},
        legend_title="types",
    )
    assert w.color_by == "categorical"
    assert w.legend_labels == ["a", "b", "c"]
    assert w.point_palette == ["#111111", "#222222", "#333333"]
    w.set_color(
        np.array([0.0, 0.5, 1.0, 0.25]),
        continuous_range=("#ffffff", "#ff0000"),
        legend_title="seq",
    )
    assert w.point_palette[0].lower() == "#ffffff"
    assert w.point_palette[-1].lower() == "#ff0000"


def test_constructor_rejects_missing_or_empty_adata():
    with pytest.raises(TypeError):
        LandmarksWidget()
    with pytest.raises(TypeError, match="AnnData"):
        LandmarksWidget(object())
    with pytest.raises(ValueError, match="at least one observation"):
        LandmarksWidget(adata_xy([], []))


def test_gallery_requires_title():
    with pytest.raises(ValueError):
        GalleryWidget(items=[{"description": "no title"}])
    g = GalleryWidget(
        items=[
            {"title": "A", "description": "alpha", "image": "data:image/svg+xml,x"},
            {"title": "B"},
        ],
        selected_index=0,
        columns=4,
    )
    assert g.selected_index == 0
    assert len(g.items) == 2


@pytest.mark.parametrize(
    ("selection", "expected"),
    [
        ({"type": "polygon", "vertices": SQUARE}, ["c0"]),
        ({"type": "rectangle", "cx": 0.0, "cy": 0.0, "width": 1.0, "height": 1.0, "angle": 0.0}, ["c0"]),
        # Promoted neighbourhoods freeze membership: indices win over a hull that misses.
        ({"type": "points", "point_indices": [0, 2], "vertices": [[10, 10], [11, 10], [11, 11]]}, ["c0", "c2"]),
    ],
    ids=["polygon", "rectangle", "point_indices"],
)
def test_get_obs_names_by_selection_shape(selection, expected):
    adata = adata_xy([0.0, 2.0, 2.0], [0.0, 2.0, 0.0])
    w = LandmarksWidget(adata)
    w.selections = [{"id": "s", **selection}]
    assert list(w.get_obs_names(adata, selection_id="s")) == expected
    assert list(w.get_obs_names(adata, selection_id="all")) == ["c0", "c1", "c2"]
    assert list(w.get_obs_names(adata, selection_id="missing")) == []


def test_category_colors_match_the_legend():
    x = [0.0, 1.0, 2.0]
    y = [0.0, 1.0, 2.0]
    w = LandmarksWidget(adata_xy(x, y, color=["a", "b", "a"]), color="label")
    colors = w.category_colors()
    assert colors == dict(zip(w.legend_labels, w.point_palette))
    assert colors == w.category_colors("label")
    with pytest.raises(KeyError):
        w.category_colors("missing")
