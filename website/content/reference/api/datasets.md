# Datasets

Load milume demo AnnData from pip or molab without a git checkout ([#380](https://github.com/ckmah/milume/issues/380)).

```python
import milume.datasets as mds

adata = mds.ileum_merfish_xu2026()
names = mds.list_datasets()
meta = mds.info("ileum_merfish_xu2026")
path = mds.fetch("ileum_merfish_xu2026")
```

Downloads use stdlib ``urllib``, stream to a ``.part`` file, verify a pinned sha256, then rename into place. The cache root is ``$MILUME_DATA_DIR``, then ``$XDG_CACHE_HOME/milume``, then ``~/.cache/milume``. URLs are pinned to an immutable git ref (never ``main``).

## ileum_merfish_xu2026

`ileum_merfish_xu2026(*, path=None, force_download=False, **read_kwargs) -> anndata.AnnData`

Xu et al. 2026 MERFISH mouse ileum (one SPF cross-section). Shape **30,332 × 1,815**. ``X`` is log-normalized; do not re-normalize.

| Field | Value |
| --- | --- |
| Size | 5,014,135 B |
| sha256 | `059ebea8360dc95e008a06dde26fac8f1a6f76f323d92151b1bfc305df5786a1` |
| License | CC0-1.0 ([Dryad](https://doi.org/10.5061/dryad.p5hqbzm0z)) |
| Citation | Xu RJ, et al. *Cell Host & Microbe* 34(3):509–525.e13 (2026); Dryad doi:10.5061/dryad.p5hqbzm0z |

## list_datasets

`list_datasets() -> list[str]`

Registered dataset names (v1: ``ileum_merfish_xu2026`` only).

## info

`info(name) -> DatasetInfo`

Registry metadata: ``name``, ``kind``, ``size_bytes``, ``n_obs``, ``n_vars``, ``license``, ``citation``, ``url``, ``sha256``.

## fetch

`fetch(name, *, path=None, force_download=False) -> pathlib.Path`

Return a local path, downloading when needed. ``force_download=True`` replaces a valid cache entry.

## DatasetInfo

Frozen dataclass with the same fields as ``info()``.

## Tier reference

Other demo tiers (tiny fixtures, Pyxa ``xsmall``/``small``, colon) stay on checkout paths or Hugging Face until later registry entries ([#343](https://github.com/ckmah/milume/issues/343)).

See also the [Datasets tier table](datasets.md) for fields, citations, and in-repo paths.
