"""Internal dataset registry (issue #380). Not part of ``milume.__all__``."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# Pinned to v2.1.0 (immutable); never raw.githubusercontent.com/.../main/...
_ILEUM_URL = (
    "https://raw.githubusercontent.com/ckmah/milume/v2.1.0/demos/data/ileum.h5ad"
)
_ILEUM_SHA256 = "059ebea8360dc95e008a06dde26fac8f1a6f76f323d92151b1bfc305df5786a1"

_REGISTRY: dict[str, dict[str, Any]] = {
    "ileum_merfish_xu2026": {
        "name": "ileum_merfish_xu2026",
        "kind": "anndata_h5ad",
        "cache_filename": "ileum_merfish_xu2026.h5ad",
        "url": _ILEUM_URL,
        "sha256": _ILEUM_SHA256,
        "size_bytes": 5_014_135,
        "n_obs": 30_332,
        "n_vars": 1_815,
        "license": "CC0-1.0",
        "citation": (
            "Xu RJ, Zhang H, Cadinu P, Nicol PB, Herrmann US, Lee T, Geistlinger L, "
            "Irizarry RA, Moffitt JR. Cell Host & Microbe 34(3):509-525.e13 (2026). "
            "Dryad doi:10.5061/dryad.p5hqbzm0z"
        ),
    },
}


@dataclass(frozen=True, slots=True)
class DatasetInfo:
    """Metadata for one registered demo dataset."""

    name: str
    kind: str
    size_bytes: int
    n_obs: int
    n_vars: int
    license: str
    citation: str
    url: str
    sha256: str


def registry_entry(name: str) -> dict[str, Any]:
    try:
        return _REGISTRY[name]
    except KeyError as e:
        raise KeyError(f"unknown dataset {name!r}; choose from {list(_REGISTRY)!r}") from e


def list_names() -> list[str]:
    return sorted(_REGISTRY)


def entry_to_info(entry: dict[str, Any]) -> DatasetInfo:
    return DatasetInfo(
        name=entry["name"],
        kind=entry["kind"],
        size_bytes=entry["size_bytes"],
        n_obs=entry["n_obs"],
        n_vars=entry["n_vars"],
        license=entry["license"],
        citation=entry["citation"],
        url=entry["url"],
        sha256=entry["sha256"],
    )
