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

CRYPT_VILLUS_X_HALF_UM = 200.0


def _cell_asset_digest(content: bytes) -> tuple[str, int]:
    return hashlib.sha256(content).hexdigest(), len(content)


def _strip_adata_map(adata):
    import numpy as np

    xy = np.asarray(adata.obsm["spatial"])
    mucosa = adata.obs["anatomical_layer"].astype(str).eq("Mucosa").to_numpy()
    x_mid = float(np.median(xy[mucosa, 0]))
    strip = mucosa & (xy[:, 0] >= x_mid - CRYPT_VILLUS_X_HALF_UM) & (
        xy[:, 0] <= x_mid + CRYPT_VILLUS_X_HALF_UM
    )
    adata_map = adata[strip].copy()
    adata_map.obs = adata_map.obs[["cell_type", "n_counts"]].copy()
    return adata_map


def _update_widget_state(state: dict[str, Any], adata_map) -> None:
    from milume.genes import gene_names_from_adata, pack_eager_gene_matrix

    names = gene_names_from_adata(adata_map, None)
    meta, payload = pack_eager_gene_matrix(adata_map, names, adata_map.n_obs)
    state["gene_names"] = meta
    state.update(payload)


def _walk_notifications(cell: dict[str, Any]) -> list[dict[str, Any]]:
    resources = cell.get("resources") or {}
    notes = resources.get("modelNotifications") or []
    states: list[dict[str, Any]] = []
    for note in notes:
        message = note.get("message") or {}
        state = message.get("state")
        if isinstance(state, dict) and "points_data" in state:
            states.append(state)
    return states


def inject_landmark_map_genes(cell_path: Path, adata_map) -> tuple[bool, str | None, str | None]:
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


def inject_moran_recipe_views(recipe_dir: Path) -> dict[str, str]:
    import milume as ml
    import numpy as np

    ileum = ROOT / "demos" / "data" / "ileum.h5ad"
    adata = ml.ds.ileum_merfish_xu2026(path=ileum)
    if "n_counts" not in adata.obs.columns:
        adata.obs["n_counts"] = np.asarray(adata.layers["raw_counts"].sum(axis=1)).ravel()
    adata_map = _strip_adata_map(adata)
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
    print(
        f"inject-recipe-gene-preload: {updated} cell, "
        f"{adata_map.n_obs} cells, {adata_map.n_vars} genes"
    )
    return asset_renames


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: inject_recipe_gene_preload.py <recipe-content-dir>")
    inject_moran_recipe_views(Path(sys.argv[1]))
