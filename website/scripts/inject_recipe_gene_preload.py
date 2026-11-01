#!/usr/bin/env python3
"""Inject gzip eager gene CSC into a prepared recipe landmark_map cell export."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "demos" / "recipes"))

from moran_static_page_genes import (  # noqa: E402
    STATIC_PAGE_GENES,
    _slim_widget_state,
    static_page_gene_count,
)
from marimo_export.manifest import (  # noqa: E402
    MAX_PREPARED_MANIFEST_BYTES,
    prepared_manifest_bytes,
)


def _cell_asset_digest(content: bytes) -> tuple[str, int]:
    return hashlib.sha256(content).hexdigest(), len(content)


def _map_adata_for_widget(adata):
    adata_map = adata.copy()
    adata_map.obs = adata_map.obs[["cell_type", "n_counts"]].copy()
    return adata_map


def _full_widget_state(
    adata_map,
    *,
    color: str = "Erbb3",
    genes: tuple[str, ...] = STATIC_PAGE_GENES,
) -> dict[str, Any]:
    from milume.genes import pack_eager_gene_matrix

    import milume as ml

    widget = ml.peek(adata_map, color=color, genes=list(genes))
    state: dict[str, Any] = {}
    for name in widget.trait_names(sync=True):
        if name == "layout":
            continue
        state[name] = getattr(widget, name)
    meta, payload = pack_eager_gene_matrix(adata_map, list(genes), adata_map.n_obs)
    state["gene_names"] = meta
    state.update(payload)
    return state


def _update_widget_state(state: dict[str, Any], adata_map) -> None:
    fresh = _full_widget_state(adata_map)
    for key, value in fresh.items():
        state[key] = value


def _walk_notifications(cell: dict[str, Any]) -> list[dict[str, Any]]:
    resources = cell.get("resources") or {}
    notes = resources.get("modelNotifications") or []
    states: list[dict[str, Any]] = []
    for note in notes:
        message = note.get("message") or {}
        widget_state = message.get("state")
        if isinstance(widget_state, dict) and "points_data" in widget_state:
            states.append(widget_state)
    return states


def inject_landmark_map_genes(
    cell_path: Path,
    adata_map,
) -> tuple[bool, str | None, str | None]:
    from marimo_export._json import canonical_bytes, decode_json_object

    raw = cell_path.read_bytes()
    data = decode_json_object(raw, cell_path.name, max_values=2_000_000)
    states = _walk_notifications(data)
    if not states:
        return False, None, None
    old_digest = cell_path.name.removesuffix(".cell.json")
    for state in states:
        _update_widget_state(state, adata_map)
    cell_path.write_bytes(canonical_bytes(data, max_values=2_000_000))
    new_digest, _size = _cell_asset_digest(cell_path.read_bytes())
    return True, old_digest, new_digest


def _sync_export_index_and_current(views_root: Path, slim_w: dict[str, Any]) -> int:
    """Align export index + ``current`` prepared manifest with slim page data."""
    from marimo_export.wire import state_fingerprint

    zero_python = views_root / "docs" / "zero-python"
    instance_dir = next(
        d for d in zero_python.iterdir() if d.is_dir() and (d / "index.json").is_file()
    )
    index_path = instance_dir / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))

    old_fp = None
    state_entry = None
    for fp, st in index["states"].items():
        w = (st.get("inputs") or {}).get("w")
        if isinstance(w, dict) and "points_data" in w:
            old_fp = fp
            state_entry = st
            break
    if old_fp is None or state_entry is None:
        raise RuntimeError("inject-recipe-gene-preload: landmark widget state missing from export index")

    new_inputs = dict(state_entry["inputs"])
    new_inputs["w"] = slim_w
    new_fp = state_fingerprint(new_inputs)
    new_entry = dict(state_entry)
    new_entry["inputs"] = new_inputs

    states = dict(index["states"])
    if old_fp != new_fp:
        states.pop(old_fp, None)
    states[new_fp] = new_entry
    index["states"] = states

    for alias, fp in list((index.get("aliases") or {}).items()):
        if fp == old_fp:
            index["aliases"][alias] = new_fp
    if index.get("default_state") == old_fp:
        index["default_state"] = new_fp

    index_path.write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")

    current_path = zero_python / "current"
    current = json.loads(current_path.read_text(encoding="utf-8"))
    prepared = current.get("prepared") or {}
    prepared["inputs"] = new_inputs
    prepared["state_fingerprint"] = new_fp
    prepared["instance"] = instance_dir.name
    export_url = str(prepared.get("export_url") or "")
    if not export_url.endswith("/"):
        prepared["export_url"] = f"./{instance_dir.name}/"
    manifest_size = len(
        prepared_manifest_bytes(
            {
                "schema": "marimo-export.prepared.v1",
                "instance": instance_dir.name,
                "export_url": prepared["export_url"],
                "inputs": new_inputs,
                "state_fingerprint": new_fp,
            }
        )
    )
    current["prepared"] = prepared
    current_path.write_text(json.dumps(current, separators=(",", ":")), encoding="utf-8")
    return manifest_size


def inject_moran_recipe_views(recipe_dir: Path) -> dict[str, str]:
    import milume as ml
    import numpy as np

    ileum = ROOT / "demos" / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum)
    if "n_counts" not in adata.obs.columns:
        adata.obs["n_counts"] = np.asarray(adata.layers["raw_counts"].sum(axis=1)).ravel()
    adata_map = _map_adata_for_widget(adata)
    if adata_map.n_obs != 30_332:
        raise RuntimeError(
            f"inject-recipe-gene-preload: expected 30,332 cells, got {adata_map.n_obs:,}"
        )

    widget = ml.peek(adata_map, color="Erbb3", genes=list(STATIC_PAGE_GENES))
    slim = _slim_widget_state(widget, list(STATIC_PAGE_GENES))

    views = recipe_dir / "_marimo-studio" / "views"
    updated = 0
    asset_renames: dict[str, str] = {}
    for cell_path in views.rglob("*.cell.json"):
        ok, old_digest, new_digest = inject_landmark_map_genes(cell_path, adata_map)
        if not ok:
            continue
        updated += 1
        if old_digest and new_digest and old_digest != new_digest:
            asset_renames[old_digest] = new_digest
    if updated != 1:
        raise RuntimeError(
            f"inject-recipe-gene-preload: expected 1 landmark_map cell, updated {updated}"
        )

    manifest_size = _sync_export_index_and_current(views, slim)
    if manifest_size > MAX_PREPARED_MANIFEST_BYTES:
        raise RuntimeError(
            "inject-recipe-gene-preload: prepared manifest "
            f"{manifest_size:,} B exceeds {MAX_PREPARED_MANIFEST_BYTES:,} B"
        )
    print(
        f"inject-recipe-gene-preload: {updated} cell, "
        f"{adata_map.n_obs:,} cells, {static_page_gene_count} genes, "
        f"prepared_manifest={manifest_size:,} B"
    )
    return asset_renames


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: inject_recipe_gene_preload.py <recipe-content-dir>")
    inject_moran_recipe_views(Path(sys.argv[1]))
