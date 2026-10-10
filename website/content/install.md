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

## Quickstart

Format data as `AnnData` with coordinates in `obsm["spatial"]`, then open the
widget:

```python
import milume

w = milume.peek(adata, color="cell_type")
w  # display in the notebook
```

Full walkthrough: [Quickstart](quickstart.md).

## Next

- [Quickstart](quickstart.md)
- [LandmarksWidget API](api/landmarks/)
- [Open Landmarks demo](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/landmarks.py)
