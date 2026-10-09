# Install

## pip

```bash
pip install milume
```

Requires Python 3.11+.

## From source

```bash
uv sync --extra demo --group dev
```

Use the `demo` extra for marimo notebooks and spatial-omics helpers used by
`demos/`.

## Quickstart — LandmarksWidget

Format data as `AnnData` with coordinates in `obsm["spatial"]`, then construct
the widget:

```python
from milume import LandmarksWidget

w = LandmarksWidget(adata, color="cell_type")
w  # display in the notebook
```

Optional gene catalog for view-only coloring:

```python
w = LandmarksWidget(adata, color="cell_type", genes=["GeneA", "GeneB"])
```

Persist selection hits as observation names (not positional indices):

```python
obs_names = w.get_obs_names()
```

Full guide: [LandmarksWidget](landmarks.md).

## Next

- [LandmarksWidget](landmarks.md)
- [LandmarksWidget API](api/landmarks.md)
- [Open Landmarks demo](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/landmarks.py)
