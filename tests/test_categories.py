import pandas as pd

from milume.categories import default_categorical_palette
from tests.helpers import adata_xy


def test_default_palette_gives_each_category_a_distinct_colour():
    for n in (3, 10, 15, 25, 45, 60):
        palette = default_categorical_palette(n)
        assert len(palette) == len(set(palette)) == n
    # Selection / landmark chrome colours never double as a category colour.
    reserved = {"#00e5ff", "#ff2d95", "#b8ff00", "#ff0099", "#00b7ff"}
    assert reserved.isdisjoint(default_categorical_palette(60))


def test_widget_uses_size_matched_palette_without_uns_colors():
    from milume import LandmarksWidget

    labels = [f"t{i}" for i in range(7)]
    adata = adata_xy(
        list(range(7)),
        list(range(7)),
        color=labels,
        color_key="cell_type",
    )
    w = LandmarksWidget(adata, color="cell_type")
    assert w._look["point_palette"] == default_categorical_palette(7)


def test_constructor_offers_string_and_categorical_obs_columns():
    from milume import LandmarksWidget

    cell_class = pd.Categorical(
        ["Epi", "Imm", "Epi", "Fib"], categories=["Epi", "Imm", "Fib"]
    )
    cell_type = ["Stem", "T", "Enterocyte", "FB1"]
    adata = adata_xy(
        [0.0, 1.0, 2.0, 3.0],
        [0.0, 1.0, 0.0, 1.0],
        color=cell_class,
        color_key="cell_class",
        uns={"cell_class_colors": ["#111111", "#222222", "#333333"]},
    )
    adata.obs["cell_type"] = cell_type
    adata.obs["score"] = [0.1, 0.2, 0.3, 0.4]
    w = LandmarksWidget(adata, color="cell_class")
    names = [c["name"] for c in w._category_columns]
    assert "cell_class" in names
    assert "cell_type" in names
    assert "score" not in names
    assert w.active_category == "cell_class"
    assert w._color_state["legend_labels"] == ["Epi", "Imm", "Fib"]
    assert w._look["point_palette"] == ["#111111", "#222222", "#333333"]


def test_missing_values_in_text_and_categorical_columns_become_a_label():
    import numpy as np

    from milume.categories import MISSING_LABEL, as_frame, detect_category_columns, encode_category_bundle

    obs = pd.DataFrame(
        {
            "text": pd.Series(["a", np.nan, "b", "a"], dtype=object),
            "cat": pd.Categorical(["x", "y", None, "x"]),
            "nullable": pd.array(["u", pd.NA, "v", "u"], dtype="string"),
        }
    )
    df = as_frame(obs)
    cols = detect_category_columns(df)
    assert cols == ["text", "cat", "nullable"]
    meta, _, labels = encode_category_bundle(df, cols)
    by_name = {m["name"]: m["labels"] for m in meta}
    assert by_name["text"] == ["a", MISSING_LABEL, "b"]
    assert by_name["cat"] == ["x", "y", MISSING_LABEL]
    assert labels["nullable"].tolist() == ["u", MISSING_LABEL, "v", "u"]


def _decode(codes_b64, n_cols, n):
    import base64

    import numpy as np

    return np.frombuffer(base64.b64decode(codes_b64), dtype=np.int32).reshape(n_cols, n)


def test_labels_follow_first_appearance_and_codes_index_them_at_170k():
    import numpy as np

    from milume.categories import MISSING_LABEL, as_frame, default_categorical_palette, encode_category_bundle

    rng = np.random.default_rng(309)
    n = 170_000
    pool = np.array([f"type_{i}" for i in range(40)], dtype=object)
    text = pool[rng.integers(0, 40, n)]
    text[rng.random(n) < 0.02] = None
    cat = pd.Categorical(pool[rng.integers(0, 12, n)], categories=list(pool[:12][::-1]))
    obs = pd.DataFrame({"text": text, "cat": cat})
    meta, codes_b64, labels = encode_category_bundle(as_frame(obs), ["text", "cat"])
    codes = _decode(codes_b64, 2, n)
    for col, (m, row) in zip(["text", "cat"], zip(meta, codes)):
        values = ["NA" if v is None or v != v else str(v) for v in obs[col].astype(object)]
        expected_labels = list(dict.fromkeys(values))  # first appearance, not category order
        assert m["labels"] == expected_labels
        assert m["palette"] == default_categorical_palette(len(expected_labels))
        assert [m["labels"][c] for c in row[:2000]] == values[:2000]
        np.testing.assert_array_equal(np.asarray(m["labels"])[row], np.asarray(values))
        assert labels[col].tolist() == values
    assert MISSING_LABEL in meta[0]["labels"]


def test_uns_colour_order_comes_first_then_unmapped_labels():
    from milume.categories import as_frame, default_categorical_palette, encode_category_bundle

    df = as_frame(pd.DataFrame({"k": ["b", "c", "a", "d", "b"]}))
    cmap = {"absent": "#000000", "a": "#aa0000", "b": "#bb0000"}
    (meta,), codes_b64, _ = encode_category_bundle(df, ["k"], color_maps={"k": cmap})
    assert meta["labels"] == ["a", "b", "c", "d"]
    fallback = default_categorical_palette(4)
    assert meta["palette"] == ["#aa0000", "#bb0000", fallback[2], fallback[3]]
    assert _decode(codes_b64, 1, 5)[0].tolist() == [1, 2, 0, 3, 1]


def test_boolean_and_odd_text_columns_keep_their_labels():
    import numpy as np

    from milume.categories import as_frame, detect_category_columns, encode_category_bundle

    obs = pd.DataFrame(
        {
            "flag": np.array([True, False, True]),
            "nullable_bool": pd.array([True, None, False], dtype="boolean"),
            "literal_na": np.array(["NA", None, "x"], dtype=object),
            "mixed": np.array([1, "1", 2.5], dtype=object),
            "unused_cats": pd.Categorical(["a", "b", "a"], categories=["z", "a", "b"]),
            "score": [0.1, 0.2, 0.3],
        }
    )
    df = as_frame(obs)
    cols = detect_category_columns(df)
    # ``mixed`` stringifies to two levels ("1", "2.5"); numeric columns are never categories.
    assert cols == ["flag", "nullable_bool", "literal_na", "mixed", "unused_cats"]
    meta, _, _ = encode_category_bundle(df, cols)
    by_name = {m["name"]: m["labels"] for m in meta}
    assert by_name["flag"] == ["true", "false"]
    assert by_name["nullable_bool"] == ["True", "NA", "False"]
    assert by_name["literal_na"] == ["NA", "x"]  # a literal "NA" shares the missing label
    assert by_name["mixed"] == ["1", "2.5"]
    assert by_name["unused_cats"] == ["a", "b"]


def test_detect_caps_levels_at_128_and_counts_missing_as_a_level():
    import numpy as np

    from milume.categories import as_frame, detect_category_columns

    n = 1000
    obs = pd.DataFrame(
        {
            "l128": np.array([f"L{i % 128}" for i in range(n)], dtype=object),
            "l129": np.array([f"L{i % 129}" for i in range(n)], dtype=object),
            "l127_plus_missing": np.array([f"L{i % 127}" if i % 7 else None for i in range(n)], dtype=object),
            "l128_plus_missing": pd.Categorical([f"L{i % 128}" if i % 7 else None for i in range(n)]),
            "one_level": ["x"] * n,
            "one_level_plus_missing": ["x" if i else None for i in range(n)],
        }
    )
    assert detect_category_columns(as_frame(obs)) == [
        "l128",
        "l127_plus_missing",
        "one_level_plus_missing",
    ]


def test_milume_does_not_import_polars():
    import subprocess
    import sys
    import textwrap

    code = textwrap.dedent(
        """
        import sys
        import pandas as pd
        from milume import LandmarksWidget
        from tests.helpers import adata_xy
        w = LandmarksWidget(adata_xy([0, 1, 2], [0, 1, 0], color=["a", "b", "a"], color_key="t"), color="t")
        w.color = "t"
        print("polars" in sys.modules)
        """
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    assert out.stdout.strip() == "False"
