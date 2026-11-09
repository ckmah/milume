"""Cell-asset renames must key on the export hash, not Path.stem."""

from __future__ import annotations

import json
from pathlib import Path

from marimo_export.index import EXPORT_SCHEMA
from marimo_export.wire import state_fingerprint

from reconcile_recipe_cell_assets import (
    _canonicalize_asset_files,
    _cell_asset_digest,
    reconcile_prepared_views,
)


def test_rename_key_is_the_full_export_hash(tmp_path: Path) -> None:
    assets = tmp_path / "assets"
    assets.mkdir()
    published = "28de93035669b10bbf5d566fdb67b081166fd0d92fb9fa2dd012afa83df8d411"
    payload = b'{"resources":{"files":{"anywidget.js":"/widgets/landmarks.mjs"}}}'
    (assets / f"{published}.cell.json").write_bytes(payload)

    renames = _canonicalize_asset_files(assets)

    digest, _size = _cell_asset_digest(payload)
    assert renames == {published: digest}
    assert not (assets / f"{published}.cell.json").exists()
    assert (assets / f"{digest}.cell.json").read_bytes() == payload


def test_matching_filename_is_not_a_rename(tmp_path: Path) -> None:
    assets = tmp_path / "assets"
    assets.mkdir()
    payload = b'{"gene_names":["Erbb3"]}'
    digest, _size = _cell_asset_digest(payload)
    path = assets / f"{digest}.cell.json"
    path.write_bytes(payload)

    renames = _canonicalize_asset_files(assets)

    assert renames == {}
    assert path.read_bytes() == payload


def test_reconcile_points_the_index_at_the_renamed_cell(tmp_path: Path) -> None:
    published = "28de93035669b10bbf5d566fdb67b081166fd0d92fb9fa2dd012afa83df8d411"
    payload = b'{"resources":{"files":{"anywidget.js":"/widgets/landmarks.mjs"}}}'
    digest, _size = _cell_asset_digest(payload)
    inputs = {"w": None}
    fingerprint = state_fingerprint(inputs)
    old_instance = "e" * 64
    views = tmp_path / "views"
    instance = views / "docs" / "zero-python" / old_instance
    assets = instance / "assets"
    assets.mkdir(parents=True)
    (assets / f"{published}.cell.json").write_bytes(payload)
    index = {
        "schema": EXPORT_SCHEMA,
        "spec_sha256": "b" * 64,
        "default_state": fingerprint,
        "notebook": {"filename": "n.py", "document_sha256": "c" * 64},
        "producer": {
            "marimo": "0.25.2",
            "marimo_export": "0.4.1",
            "implementation_sha256": "d" * 64,
        },
        "inputs": ["w"],
        "control_bindings": {},
        "outputs": ["out"],
        "aliases": {},
        "states": {
            fingerprint: {
                "inputs": inputs,
                "outputs": {
                    "out": {
                        "asset": {"sha256": published, "size": len(payload)},
                        "codec": "marimo.cell.v1",
                        "media_type": "application/vnd.marimo.cell.v1+json",
                        "provenance": {"python_type": "str"},
                    }
                },
            }
        },
    }
    (instance / "index.json").write_text(json.dumps(index), encoding="utf-8")
    (views / "docs" / "zero-python" / "current").write_text(
        json.dumps(
            {
                "prepared": {
                    "instance": old_instance,
                    "export_url": f"./{old_instance}/",
                    "inputs": inputs,
                    "state_fingerprint": fingerprint,
                }
            }
        ),
        encoding="utf-8",
    )
    (views / "docs" / "config").write_text(
        json.dumps({"runtime": {"instance": old_instance}}),
        encoding="utf-8",
    )

    reconcile_prepared_views(views)

    zero_python = views / "docs" / "zero-python"
    instances = [path for path in zero_python.iterdir() if path.is_dir()]
    assert len(instances) == 1
    renamed = instances[0]
    assert renamed.name != old_instance
    assert (renamed / "assets" / f"{digest}.cell.json").is_file()
    assert not (renamed / "assets" / f"{published}.cell.json").exists()
    updated = json.loads((renamed / "index.json").read_text(encoding="utf-8"))
    asset = updated["states"][fingerprint]["outputs"]["out"]["asset"]
    assert asset["sha256"] == digest
    current = json.loads((zero_python / "current").read_text(encoding="utf-8"))
    assert current["prepared"]["instance"] == renamed.name
    assert renamed.name in current["prepared"]["export_url"]
