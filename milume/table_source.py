"""Pick the table, coordinate system and cell coordinates to plot from a SpatialData.

SpatialData stores no canonical "where is each cell" array. Platforms differ:

* Pyxa / Meteor and squidpy-style tables carry ``obsm["spatial"]``.
* Xenium, MERFISH, Visium HD segmentations, SpaceM tables carry none: a cell's
  position is the centroid of the element (labels or shapes) the table annotates.
* One table may annotate several elements (one per FOV or slide) that live in
  different coordinate systems (MIBI-TOF), or elements of different kinds
  (SpaceM cells and ablation marks).

The table's ``spatialdata_attrs`` (``region``, ``region_key``, ``instance_key``)
say which element each row belongs to; each element's transformations say which
coordinate systems it lives in. This module reads exactly that, so callers do not
have to.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np

_GLOBAL = "global"
# uns key naming the obsm keys Milume derived from elements (value: coordinate system),
# so a later widget in another coordinate system recomputes them instead of trusting them.
DERIVED_KEY = "milume_derived_obsm"


@dataclass(frozen=True)
class TableSelection:
    """A table narrowed to the rows that live in one coordinate system."""

    name: str
    adata: Any
    coordinate_system: str | None
    keep: np.ndarray  # bool (n_obs,): rows in the chosen regions and coordinate system
    row_region: np.ndarray | None  # object (n_obs,): annotated element per row, if any


def _attrs(adata: Any) -> dict:
    return adata.uns.get("spatialdata_attrs") or {}


def row_regions(adata: Any) -> np.ndarray | None:
    """Name of the element each row annotates, or ``None`` if the table annotates nothing."""
    attrs = _attrs(adata)
    region = attrs.get("region")
    if region is None:
        return None
    names = [str(region)] if isinstance(region, str) else [str(r) for r in region]
    if not names:
        return None
    if len(names) == 1:
        return np.full(adata.n_obs, names[0], dtype=object)
    key = attrs.get("region_key")
    if key not in adata.obs:
        return None
    return adata.obs[key].astype(str).to_numpy(dtype=object)


def _element(sdata: Any, name: str) -> Any | None:
    try:
        return sdata[name]
    except KeyError:
        return None


def _systems(element: Any) -> set[str]:
    from spatialdata.transformations import get_transformation

    return set(get_transformation(element, get_all=True))


def pick_table(sdata: Any, table: str | None) -> str:
    names = list(sdata.tables)
    if table is not None:
        if table not in sdata.tables:
            raise ValueError(f"no table {table!r} in this SpatialData; tables: {names}")
        return table
    if not names:
        raise ValueError("this SpatialData has no table: Milume plots a table's cells")
    if len(names) == 1:
        return names[0]

    def links_labels(name: str) -> bool:
        # ``region`` may also be a list of elements; only a single name links labels.
        region = _attrs(sdata.tables[name]).get("region")
        return isinstance(region, str) and region in sdata.labels

    linked = [n for n in names if links_labels(n)]
    if len(linked) == 1:
        return linked[0]
    detail = []
    for n in names:
        rr = row_regions(sdata.tables[n])
        regions = sorted(set(rr.tolist())) if rr is not None else []
        detail.append(f"{n!r} (annotates {regions})" if regions else repr(n))
    raise ValueError(f"several tables {', '.join(detail)}: pass table=<name>")


def _default_system(systems: dict[str, set[str]], regions: np.ndarray) -> str:
    """The coordinate system holding the most rows; ``global`` wins a tie of full coverage."""
    counts: dict[str, int] = {}
    for r, n in zip(*np.unique(regions.astype(str), return_counts=True)):
        for cs in systems.get(str(r), ()):
            counts[cs] = counts.get(cs, 0) + int(n)
    total = int(regions.size)
    full = sorted(cs for cs, c in counts.items() if c == total)
    if full:
        return _GLOBAL if _GLOBAL in full else full[0]
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    if not ranked:
        raise ValueError("none of the annotated elements has a coordinate system")
    best, n_best = ranked[0]
    others = ", ".join(f"{cs!r} ({c})" for cs, c in ranked[1:])
    warnings.warn(
        f"the table's elements live in different coordinate systems: showing {best!r} "
        f"({n_best} of {total} cells); others: {others}. Pass coordinate_system= to choose.",
        UserWarning,
        stacklevel=4,
    )
    return best


def select_table(
    sdata: Any,
    *,
    table: str | None = None,
    coordinate_system: str | None = None,
    region: str | list[str] | None = None,
) -> TableSelection:
    """Choose the table and the rows of it that share one coordinate system.

    ``region`` restricts to the named annotated element(s). ``coordinate_system``
    defaults to the one holding most rows (``global`` when it holds them all).
    """
    name = pick_table(sdata, table)
    adata = sdata.tables[name]
    rr = row_regions(adata)
    keep = np.ones(adata.n_obs, dtype=bool)
    if rr is None:
        if region is not None:
            raise ValueError(f"table {name!r} annotates no element: region= does not apply")
        return TableSelection(name, adata, coordinate_system, keep, None)

    annotated = sorted(set(rr.tolist()))
    if region is not None:
        wanted = [region] if isinstance(region, str) else [str(r) for r in region]
        unknown = [r for r in wanted if r not in annotated]
        if unknown:
            raise ValueError(f"table {name!r} does not annotate {unknown}; it annotates {annotated}")
        keep &= np.isin(rr, wanted)

    elements = {r: _element(sdata, r) for r in dict.fromkeys(rr[keep].tolist())}
    missing = [r for r, e in elements.items() if e is None]
    if missing:
        warnings.warn(
            f"table {name!r} annotates {missing}, which are not in this SpatialData: those cells are left out",
            UserWarning,
            stacklevel=3,
        )
        keep &= ~np.isin(rr, missing)
    systems = {r: _systems(e) for r, e in elements.items() if e is not None}
    if not systems:
        raise ValueError(f"table {name!r}: none of its annotated elements {annotated} is in this SpatialData")

    cs = coordinate_system
    if cs is None:
        cs = _default_system(systems, rr[keep])
    elif not any(cs in s for s in systems.values()):
        available = sorted(set().union(*systems.values()))
        raise ValueError(f"coordinate_system {cs!r} not found for table {name!r}; available: {available}")
    outside = [r for r, s in systems.items() if cs not in s]
    if outside:
        keep &= ~np.isin(rr, outside)
    return TableSelection(name, adata, cs, keep, rr)


def _centroids(sdata: Any, sel: TableSelection) -> tuple[np.ndarray, np.ndarray]:
    """Per-row element centroids in ``sel.coordinate_system``: ``(n_obs, 2|3)`` array and ok mask."""
    import pandas as pd
    from spatialdata import get_centroids

    adata, rr = sel.adata, sel.row_region
    instance_key = _attrs(adata).get("instance_key")
    if instance_key not in adata.obs:
        raise ValueError(
            "the table has no obsm['spatial'] and its instance_key column "
            f"{instance_key!r} is missing, so cell positions cannot be derived from the elements"
        )
    ids = pd.Index(adata.obs[instance_key].to_numpy()).astype(str)

    parts = []
    for r in dict.fromkeys(rr[sel.keep].tolist()):
        rows = np.flatnonzero(sel.keep & (rr == r))
        cent = get_centroids(sdata[r], coordinate_system=sel.coordinate_system)
        cent = cent.compute() if hasattr(cent, "compute") else cent
        axes = [a for a in ("x", "y", "z") if a in cent.columns]
        pos = pd.Index(cent.index.astype(str)).get_indexer(ids[rows])
        parts.append((rows, cent[axes].to_numpy(dtype=np.float64), axes, pos))

    dim = 3 if all("z" in axes for _, _, axes, _ in parts) else 2
    out = np.full((adata.n_obs, dim), np.nan)
    ok = np.zeros(adata.n_obs, dtype=bool)
    for rows, mat, axes, pos in parts:
        hit = pos >= 0
        cols = [axes.index(a) for a in ("x", "y", "z")[:dim]]
        out[rows[hit]] = mat[pos[hit]][:, cols]
        ok[rows[hit]] = True
    lost = int(sel.keep.sum() - ok.sum())
    if lost:
        warnings.warn(
            f"{lost} of {int(sel.keep.sum())} cells have no matching instance in their element: left out",
            UserWarning,
            stacklevel=4,
        )
    return out, ok


def table_coordinates(
    sdata: Any, sel: TableSelection, spatial_key: str | None = "spatial"
) -> tuple[np.ndarray | None, np.ndarray]:
    """Row positions to plot (``None`` = every row) and their ``(n, 2|3)`` coordinates.

    ``obsm[spatial_key]`` is used as is when present (it is the table's own
    statement of where its cells are). Otherwise, or when ``spatial_key`` is
    ``None``, positions are the centroids of the annotated elements in
    ``sel.coordinate_system``; derived positions are stored in
    ``obsm[spatial_key]`` (NaN where unavailable) unless that key is ``None``, so
    ``distances`` and friends work on the table afterwards. A key Milume derived
    is recomputed next time (the coordinate system may differ); a key it did not
    derive is never overwritten.
    """
    adata = sel.adata
    derived = adata.uns.get(DERIVED_KEY, {})
    if spatial_key is not None and spatial_key in adata.obsm and spatial_key not in derived:
        full = np.asarray(adata.obsm[spatial_key], dtype=np.float64)
        if full.ndim != 2 or full.shape[1] < 2:
            raise ValueError(f"adata.obsm[{spatial_key!r}] must be (n, ≥2)")
        ok = sel.keep & np.isfinite(full[:, :2]).all(axis=1)
    else:
        if sel.row_region is None:
            raise ValueError(
                f"adata.obsm[{spatial_key!r}] is required: the table annotates no element to take positions from"
            )
        full, ok = _centroids(sdata, sel)
        if spatial_key is not None:
            adata.obsm[spatial_key] = full
            adata.uns[DERIVED_KEY] = {**derived, spatial_key: sel.coordinate_system}
    if not ok.any():
        raise ValueError("no cell has coordinates in this coordinate system")
    rows = None if ok.all() else np.flatnonzero(ok)
    return rows, (full if rows is None else full[rows])
