#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

import pytest

from recipe_widget_esm import (
    _NBe_OLD,
    _SIZE_CHECK_OLD,
    _SIZE_CHECK_OLD_2,
    _XXe_OLD,
    decode_data_url,
    externalize_cell_json_files,
    inject_modulepreload,
    is_embedded_widget_esm,
    patch_zero_python_runtime,
    widget_asset_filename,
)
from recipe_widget_esm import _IZe_OLD  # noqa: PLC2701


def test_is_embedded_widget_esm_detects_anywidget_key() -> None:
    val = "data:text/javascript;base64,Y29uc29sZS5sb2coMSk="
    assert is_embedded_widget_esm("/@file/foo-anywidget-deadbeef.js", val)


def test_is_embedded_widget_esm_rejects_external_href() -> None:
    assert not is_embedded_widget_esm(
        "/@file/foo-anywidget-deadbeef.js",
        "../../assets/recipe-widgets/landmarks-abc.mjs",
    )


def test_decode_data_url_roundtrip_base64() -> None:
    raw = b"export default {}"
    enc = "data:text/javascript;base64," + __import__("base64").b64encode(raw).decode()
    assert decode_data_url(enc) == raw


def test_externalize_writes_shared_asset(tmp_path: Path) -> None:
    views = tmp_path / "views"
    assets = tmp_path / "assets"
    cell = views / "site" / "landmark_map.cell.json"
    cell.parent.mkdir(parents=True)
    payload = b"export default { render() {} };"
    b64 = __import__("base64").b64encode(payload).decode()
    cell.write_text(
        json.dumps(
            {
                "resources": {
                    "files": {
                        "/@file/1-anywidget-abcd.js": f"data:text/javascript;base64,{b64}",
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    report = externalize_cell_json_files(views, asset_dir=assets)
    assert report.cells_updated == 1
    assert report.bytes_hoisted == len(payload)
    assert len(list(assets.glob("*.mjs"))) == 1
    updated = json.loads(cell.read_text())
    href = updated["resources"]["files"]["/@file/1-anywidget-abcd.js"]
    assert href.startswith("../../assets/recipe-widgets/landmarks-")
    assert not href.startswith("data:")


def test_patch_zero_python_runtime_applies(tmp_path: Path) -> None:
    js = tmp_path / "zero-python" / "chunks" / "mount.js"
    js.parent.mkdir(parents=True)
    js.write_text(_IZe_OLD + _NBe_OLD + _SIZE_CHECK_OLD + _SIZE_CHECK_OLD_2 + _XXe_OLD, encoding="utf-8")
    patch_zero_python_runtime(tmp_path)
    text = js.read_text(encoding="utf-8")
    assert "shared widget asset URL" in text
    assert "document.baseURI" in text


def test_inject_modulepreload_appends_once() -> None:
    head = "<script data-marimo-studio-runtime></script>\n"
    tags = inject_modulepreload(head, '<link data-milume-recipe-widget rel="modulepreload">')
    assert "data-milume-recipe-widget" in tags
    assert inject_modulepreload(tags, tags) == tags


def test_widget_asset_filename_stable() -> None:
    raw = b"hello"
    assert widget_asset_filename(raw) == (
        "landmarks-" + __import__("hashlib").sha256(raw).hexdigest() + ".mjs"
    )
