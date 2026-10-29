"""molab edit mode runs demo notebooks on kernel connect (#361)."""

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_pyproject_enables_marimo_auto_instantiate_for_molab():
    data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    runtime = data.get("tool", {}).get("marimo", {}).get("runtime", {})
    assert runtime.get("auto_instantiate") is True, (
        "expected [tool.marimo.runtime] auto_instantiate = true in pyproject.toml "
        "(molab uses marimo edit; default auto_instantiate is false)"
    )
