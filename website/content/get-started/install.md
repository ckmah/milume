# Install

## pip

```bash
pip install milume
```

Requires Python 3.11+.

Each demo notebook lists its own dependencies in its inline script header, so
`uvx marimo edit --sandbox demos/landmarks.py` (or opening it on molab) installs
them for you. The [Squidpy recipe](../how-to/recipes/) also needs
scanpy, squidpy and leidenalg:

```bash
pip install squidpy scanpy leidenalg
```

## uv

```bash
uv pip install --compile-bytecode milume
```

`--compile-bytecode` compiles `.pyc` files at install time, so the first
`import milume` doesn't pay for compiling milume and its dependencies. In a
project, `uv add milume` works too (set `UV_COMPILE_BYTECODE=1` for the same
effect).

## From source

```bash
uv sync --group demo --group dev
```

The `demo` dependency group adds marimo and the spatial-omics packages used by
`demos/`. It is a development group, not a published extra.

## Next

- [Tutorial: explore cells in 2D](tutorial-explore-cells-2d.md)
- [Use with AI agents](../how-to/use-with-ai-agents.md)
- [LandmarksWidget API](../reference/api/landmarks/)
- [Open Landmarks demo](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/landmarks.py)
- [Changelog](../reference/changelog.md): what changed in each release
