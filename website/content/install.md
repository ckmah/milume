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

## Quickstart

Format data as `AnnData` with coordinates in `obsm["spatial"]`, then open the
widget:

```python
import milume

w = milume.peek(adata, color="cell_type")
w  # display in the notebook
```

Full walkthrough: [Quickstart](quickstart.md).

## Use with AI agents

Install the [use-milume](https://github.com/ckmah/milume/blob/main/skills/use-milume/SKILL.md) skill so your agent knows LandmarksWidget workflows and the public API:

```bash
npx skills add ckmah/milume --skill use-milume -a cursor -y
```

In Claude Code:

```
/plugin marketplace add ckmah/milume
/plugin install use-milume@milume
```

After `pip install milume`, copy the skill that matches your installed version (stdlib only, no Node):

```bash
python -m milume.skill install
```

Optional target directory and overwrite:

```bash
python -m milume.skill install ./.agents/skills --force
```

## Next

- [Quickstart](quickstart.md)
- [LandmarksWidget API](api/landmarks/)
- [Open Landmarks demo](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/landmarks.py)
- [Changelog](changelog.md): what changed in each release
