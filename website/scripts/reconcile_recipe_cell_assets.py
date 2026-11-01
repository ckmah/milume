#!/usr/bin/env python3
"""Re-hash marimo-studio prepared cell assets after post-export JSON edits."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from marimo_export._json import sha256_bytes
from marimo_export.index import ExportIndex


def _cell_asset_digest(content: bytes) -> tuple[str, int]:
    return hashlib.sha256(content).hexdigest(), len(content)


def _canonicalize_asset_files(assets_dir: Path) -> dict[str, str]:
    """Rename every ``*.cell.json`` to its content hash; drop duplicate paths."""
    renames: dict[str, str] = {}
    by_digest: dict[str, bytes] = {}
    for path in sorted(assets_dir.glob("*.cell.json")):
        content = path.read_bytes()
        digest, _size = _cell_asset_digest(content)
        if path.stem != digest:
            renames[path.stem] = digest
        by_digest[digest] = content

    for path in assets_dir.glob("*.cell.json"):
        path.unlink()
    for digest, content in by_digest.items():
        (assets_dir / f"{digest}.cell.json").write_bytes(content)
    return renames


def _sync_asset_descriptor(asset: dict[str, Any], assets_dir: Path) -> bool:
    sha = str(asset.get("sha256", ""))
    path = assets_dir / f"{sha}.cell.json"
    if not path.is_file():
        return False
    digest, size = _cell_asset_digest(path.read_bytes())
    changed = False
    if asset.get("sha256") != digest:
        asset["sha256"] = digest
        changed = True
    if asset.get("size") != size:
        asset["size"] = size
        changed = True
    return changed


def _update_asset_refs(node: Any, renames: dict[str, str], assets_dir: Path) -> bool:
    changed = False
    if isinstance(node, dict):
        asset = node.get("asset")
        if isinstance(asset, dict) and "sha256" in asset:
            sha = str(asset["sha256"])
            if sha in renames:
                asset["sha256"] = renames[sha]
                changed = True
            if _sync_asset_descriptor(asset, assets_dir):
                changed = True
        for value in node.values():
            if _update_asset_refs(value, renames, assets_dir):
                changed = True
    elif isinstance(node, list):
        for item in node:
            if _update_asset_refs(item, renames, assets_dir):
                changed = True
    return changed


def reindex_export_instance(instance_dir: Path, extra_renames: dict[str, str] | None = None) -> str:
    """Rewrite canonical index.json and rename the instance dir to its new identity."""
    assets_dir = instance_dir / "assets"
    if not assets_dir.is_dir():
        raise RuntimeError(f"reindex-export-instance: missing assets dir {assets_dir}")
    renames = _canonicalize_asset_files(assets_dir)
    if extra_renames:
        renames = {**renames, **extra_renames}
    index_path = instance_dir / "index.json"
    root = json.loads(index_path.read_text(encoding="utf-8"))
    _update_asset_refs(root, renames, assets_dir)
    index = ExportIndex.from_value(root)
    index_bytes = index.to_bytes()
    index_path.write_bytes(index_bytes)
    new_identity = sha256_bytes(index_bytes)
    if instance_dir.name != new_identity:
        dest = instance_dir.parent / new_identity
        if dest.exists():
            shutil.rmtree(dest)
        instance_dir.rename(dest)
        instance_dir = dest
    return new_identity


def rewire_zero_python_current(views_docs: Path, old_identity: str, new_identity: str) -> None:
    """Point ``current`` and ``config`` at a renamed export instance directory."""
    if old_identity == new_identity:
        return
    current_path = views_docs / "zero-python" / "current"
    current = json.loads(current_path.read_text(encoding="utf-8"))
    prepared = current.get("prepared") or {}
    if prepared.get("instance") == old_identity:
        prepared["instance"] = new_identity
    export_url = str(prepared.get("export_url", ""))
    if old_identity in export_url:
        prepared["export_url"] = export_url.replace(old_identity, new_identity)
    current["prepared"] = prepared
    current_path.write_text(json.dumps(current, separators=(",", ":")), encoding="utf-8")

    config_path = views_docs / "config"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    runtime = config.get("runtime") or {}
    if runtime.get("instance") == old_identity:
        runtime["instance"] = new_identity
        config["runtime"] = runtime
        config_path.write_text(json.dumps(config, separators=(",", ":")), encoding="utf-8")


def reconcile_prepared_views(views_root: Path, extra_renames: dict[str, str] | None = None) -> int:
    """Fix cell assets and export identity after post-export mutation."""
    if not views_root.is_dir():
        return 0
    bundles = 0
    zero_python = views_root / "docs" / "zero-python"
    if not zero_python.is_dir():
        return 0
    for instance_dir in sorted(zero_python.iterdir()):
        if not instance_dir.is_dir() or not (instance_dir / "index.json").is_file():
            continue
        old = instance_dir.name
        new = reindex_export_instance(instance_dir, extra_renames)
        rewire_zero_python_current(views_root / "docs", old, new)
        bundles += 1
        print(
            f"reconcile-recipe-cell-assets: instance {old[:12]}… -> {new[:12]}… "
            f"({'renamed' if old != new else 'index synced'})"
        )
    return bundles


if __name__ == "__main__":
    import sys

    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    reconcile_prepared_views(root)
