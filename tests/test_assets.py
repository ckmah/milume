from pathlib import Path

import pytest

import spatial_rx._assets as assets


@pytest.mark.parametrize("name", ["gallery", "landmarks", "volume-cube"])
def test_widget_assets_are_bundled_paths(name):
    """anywidget HMR only watches Path ``_esm``/``_css`` — never ``read_text()`` strings."""
    for asset in (assets.widget_esm(name), assets.widget_css()):
        assert isinstance(asset, Path)
        assert asset.is_file()
