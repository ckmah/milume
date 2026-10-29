"""Demo dataset tiers for notebooks, recipes, tests, and docs captures.

Not part of the ``milume`` public API. Callers install demo/dev deps (``scanpy``,
``spatialdata-io``, ``huggingface-hub``) via PEP 723 script headers or ``uv`` groups.

Tier map (issue #343):

| Tier | Function | Returns | Notes |
| --- | --- | --- | --- |
| tiny (synthetic) | ``load_tiny_synthetic_adata()`` | ``AnnData`` | In-memory fixture, no I/O |
| tiny (HF xsmall) | ``load_tiny_xsmall_pyxa()`` | ``SpatialData`` | Stellaromics/demo ``xsmall/``; needs network |
| 2D | ``load_2d_ileum_adata()`` | ``AnnData`` | ``demos/data/ileum.h5ad`` or raw GitHub on molab |

**2D tier one-liner (molab and local).** After ``import scanpy as sc``, ``from pathlib import Path``,
``import tempfile``, and ``import urllib.request``:

```python
adata = sc.read_h5ad(_f) if (_f := "demos/data/ileum.h5ad") and Path(_f).is_file() else sc.read_h5ad(urllib.request.urlretrieve("https://raw.githubusercontent.com/ckmah/milume/main/demos/data/ileum.h5ad", _f := str(Path(tempfile.gettempdir()) / "milume-demo-ileum.h5ad"))[0])
```

``load_2d_ileum_adata()`` implements the same resolution order (cwd-relative repo file, then cached download).
| 3D | ``load_3d_small_pyxa()`` | ``SpatialData`` | Stellaromics/demo ``small/``; needs network |
| full | ``load_full_colon_sdata()`` | ``SpatialData`` | Local zarr only; see #134 for streaming |

**Ileum on molab.** When the committed ``demos/data/ileum.h5ad`` is absent (GitHub blob
notebooks), the 2D loader downloads once from
``https://raw.githubusercontent.com/ckmah/milume/main/demos/data/ileum.h5ad``.
Local checkouts and CI use the in-repo file with no network.
"""

from __future__ import annotations

import os
import tempfile
import urllib.request
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import anndata as ad
    import spatialdata as sd

_REPO_ROOT = Path(__file__).resolve().parents[2]
_ILEUM_H5AD = _REPO_ROOT / "demos" / "data" / "ileum.h5ad"
_ILEUM_RAW_URL = (
    "https://raw.githubusercontent.com/ckmah/milume/main/demos/data/ileum.h5ad"
)
_DEFAULT_COLON_STORE = _REPO_ROOT / "frontend" / "dev" / "data" / "colon_a2.sdata.zarr"
_HF_DEMO = "Stellaromics/demo"


def load_tiny_synthetic_adata(*, n: int = 120, seed: int = 0) -> ad.AnnData:
    """Tiny in-memory AnnData for unit tests and recipe smoke geometry."""
    from tests.helpers import adata_xy

    import numpy as np
    import pandas as pd

    rng = np.random.default_rng(seed)
    x = rng.uniform(0, 100, n)
    y = rng.uniform(0, 100, n)
    types = pd.Categorical(rng.choice(["enterocyte", "goblet", "stem"], n))
    genes = {g: rng.random(n) for g in ("APOB", "Lgr5", "Muc2")}
    return adata_xy(x, y, color=types, color_key="cell_type", genes=genes)


def _snapshot_pyxa_dir(profile: str) -> Path:
    try:
        from huggingface_hub import snapshot_download
    except ImportError as e:
        raise ImportError(
            "Pyxa demo loaders need huggingface_hub; install it via the notebook "
            "script header or `uv sync --group demo`."
        ) from e

    return Path(
        snapshot_download(
            _HF_DEMO,
            repo_type="dataset",
            allow_patterns=f"{profile}/*",
            ignore_patterns="*cell_assigned_gene*",
        )
    ) / profile


def load_tiny_xsmall_pyxa(*, labels: bool = True) -> sd.SpatialData:
    """CI-sized Pyxa slice (``xsmall/`` on Hugging Face, ~187 cells)."""
    from spatialdata_io.experimental import pyxa

    return pyxa(_snapshot_pyxa_dir("xsmall"), cell_assigned_gene=False, labels=labels)


def load_3d_small_pyxa(*, labels: bool = True) -> sd.SpatialData:
    """3D tier mouse-brain Pyxa slice (``small/``, 4,372 cells, DAPI mosaic)."""
    from spatialdata_io.experimental import pyxa

    return pyxa(_snapshot_pyxa_dir("small"), cell_assigned_gene=False, labels=labels)


def ileum_h5ad_path(*, force_remote: bool = False) -> Path:
    """Resolved path to the ileum ``.h5ad`` (repo file or cached raw download)."""
    if not force_remote:
        cwd_local = Path("demos/data/ileum.h5ad")
        if cwd_local.is_file():
            return cwd_local
        if _ILEUM_H5AD.is_file():
            return _ILEUM_H5AD
    cache = Path(tempfile.gettempdir()) / "milume-demo-ileum.h5ad"
    if not cache.is_file() or cache.stat().st_size == 0:
        urllib.request.urlretrieve(_ILEUM_RAW_URL, cache)
    return cache


def load_2d_ileum_adata(*, force_remote: bool = False) -> ad.AnnData:
    """2D tier Xu 2026 ileum slice (30,332 cells, 1,815 QC genes, ``obsm['spatial']``)."""
    import scanpy as sc

    path = ileum_h5ad_path(force_remote=force_remote)
    if not path.is_file():
        raise FileNotFoundError(f"missing ileum demo data: {path}")
    return sc.read_h5ad(path)


def _colon_store_path() -> Path:
    env = os.environ.get("COLON_A2_STORE")
    if env:
        return Path(env)
    return _DEFAULT_COLON_STORE


def load_full_colon_sdata() -> sd.SpatialData:
    """Full colon A2 SpatialData zarr (local build only).

    Raises ``FileNotFoundError`` when the store is absent, with build instructions.
    Streaming / molab-only colon loads are tracked in issue #134.
    """
    import spatialdata as sd

    store = _colon_store_path()
    if not store.is_dir():
        raise FileNotFoundError(
            "Colon A2 demo volume is not available at "
            f"{store}. Build it locally with:\n"
            "  uv run --group demo python frontend/dev/build_colon_a2_store.py "
            "--download --overwrite\n"
            "Or set COLON_A2_STORE to an existing colon_a2.sdata.zarr path. "
            "Remote streaming is not wired here yet; see "
            "https://github.com/ckmah/milume/issues/134"
        )
    return sd.read_zarr(store)
