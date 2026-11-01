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

def _cell_asset_digest(content: bytes) -> tuple[str, int]:
    return hashlib.sha256(content).hexdigest(), len(content)


def _map_adata_for_widget(adata):
    adata_map = adata.copy()
    adata_map.obs = adata_map.obs[["cell_type", "n_counts"]].copy()
    return adata_map


def _crypt_villus_bounds(adata, half_um: float = 200.0):
    import numpy as np

    xy = np.asarray(adata.obsm["spatial"])
    mucosa = adata.obs["anatomical_layer"].astype(str).eq("Mucosa").to_numpy()
    x_mid = float(np.median(xy[mucosa, 0]))
    cv_window = mucosa & (xy[:, 0] >= x_mid - half_um) & (xy[:, 0] <= x_mid + half_um)
    xs = xy[cv_window, 0]
    ys = xy[cv_window, 1]
    return (float(xs.min()), float(xs.max())), (float(ys.min()), float(ys.max()))


def _update_widget_state(
    state: dict[str, Any],
    adata_map,
    *,
    color: str = "Apob",
    view_bounds: tuple[tuple[float, float], tuple[float, float]] | None = None,
) -> None:
    from milume.genes import gene_names_from_adata, pack_eager_gene_matrix

    import milume as ml

    widget = ml.peek(adata_map, color=color, genes=None)
    for name in widget.trait_names(sync=True):
        if name not in state:
            continue
        if name.startswith("gene_csc") or name == "gene_names" or name == "layout":
            continue
        state[name] = getattr(widget, name)
    names = gene_names_from_adata(adata_map, None)
    meta, payload = pack_eager_gene_matrix(adata_map, names, adata_map.n_obs)
    state["gene_names"] = meta
    state.update(payload)
    if view_bounds is not None:
        x_bounds, y_bounds = view_bounds
    else:
        x_bounds, y_bounds = _crypt_villus_bounds(adata_map)
    if "x_bounds" in state:
        state["x_bounds"] = list(x_bounds)
    if "y_bounds" in state:
        state["y_bounds"] = list(y_bounds)


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


def inject_landmark_map_genes(
    cell_path: Path,
    adata_map,
    *,
    view_bounds: tuple[tuple[float, float], tuple[float, float]] | None = None,
) -> tuple[bool, str | None, str | None]:
    from marimo_export._json import canonical_bytes, decode_json_object

    raw = cell_path.read_bytes()
    data = decode_json_object(raw, cell_path.name, max_values=2_000_000)
    states = _walk_notifications(data)
    if not states:
        return False, None, None
    old_digest = cell_path.name.removesuffix(".cell.json")
    if view_bounds is None:
        if "anatomical_layer" in adata_map.obs.columns:
            view_bounds = _crypt_villus_bounds(adata_map)
        else:
            import numpy as np

            xy = np.asarray(adata_map.obsm["spatial"])
            view_bounds = (
                (float(xy[:, 0].min()), float(xy[:, 0].max())),
                (float(xy[:, 1].min()), float(xy[:, 1].max())),
            )
    for state in states:
        _update_widget_state(state, adata_map, view_bounds=view_bounds)
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
    adata_map = _map_adata_for_widget(adata)
    view_bounds = _crypt_villus_bounds(adata)
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
