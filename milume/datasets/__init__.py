"""Public demo dataset loaders (scverse-style, issue #380)."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from ._fetch import DatasetChecksumError, fetch_file
from ._registry import DatasetInfo, entry_to_info, list_names, registry_entry

if TYPE_CHECKING:
    import anndata as ad

__all__ = [
    "DatasetChecksumError",
    "DatasetInfo",
    "fetch",
    "ileum_merfish_xu2026",
    "info",
    "list_datasets",
]


def list_datasets() -> list[str]:
    """Return registered dataset names."""
    return list_names()


def info(name: str) -> DatasetInfo:
    """Return registry metadata for ``name``."""
    return entry_to_info(registry_entry(name))


def fetch(
    name: str,
    *,
    path: str | Path | None = None,
    force_download: bool = False,
) -> Path:
    """Download ``name`` when needed and return the local file path.

    Parameters
    ----------
    name
        Registry key (see ``list_datasets()``).
    path
        Optional destination file. When omitted, files land under
        ``$MILUME_DATA_DIR`` or ``$XDG_CACHE_HOME/milume`` (then ``~/.cache/milume``).
    force_download
        Re-download even when a valid cached copy exists.
    """
    resolved = Path(path).expanduser() if path is not None else None
    return fetch_file(name, path=resolved, force_download=force_download)


def ileum_merfish_xu2026(
    *,
    path: str | Path | None = None,
    force_download: bool = False,
    **read_kwargs,
) -> ad.AnnData:
    """Load the Xu et al. 2026 MERFISH mouse ileum slice.

    Returns AnnData with shape 30,332 × 1,815. ``X`` is the authors'
    log-normalized matrix; do not call ``normalize_total`` or ``log1p``.

    Parameters
    ----------
    path
        Optional local ``.h5ad`` path (for tests or a checkout). When omitted,
        the file is fetched from a pinned GitHub release URL into the milume cache.
    force_download
        Re-download when resolving from the network cache.
    **read_kwargs
        Forwarded to ``anndata.read_h5ad``.

    Notes
    -----
    Size: 5,014,135 bytes. License: CC0-1.0 (Dryad doi:10.5061/dryad.p5hqbzm0z).
    """
    import anndata as ad

    local = Path(path).expanduser() if path is not None else None
    if local is not None and local.is_file() and not force_download:
        return ad.read_h5ad(local, **read_kwargs)
    h5ad = fetch_file(
        "ileum_merfish_xu2026",
        path=local,
        force_download=force_download,
    )
    return ad.read_h5ad(h5ad, **read_kwargs)
