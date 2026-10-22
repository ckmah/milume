# Install

## pip

```bash
pip install milume
```

Requires Python 3.11+.

Each demo notebook lists its own dependencies in its inline script header, so
`uvx marimo edit --sandbox demos/landmarks.py` (or opening it on molab) installs
them for you. The [Squidpy recipes](integrations/squidpy-color.md) also need
scanpy, squidpy and leidenalg:

```bash
pip install squidpy scanpy leidenalg
```

## From source

```bash
uv sync --group demo --group dev
```

The `demo` dependency group adds marimo and the spatial-omics packages used by
`demos/`. It is a development group, not a published extra.

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
