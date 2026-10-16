"""use-milume skill examples run, and the registry / skill / docs stay in sync."""

from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from helpers import adata_xy

from milume.landmarks import _PUBLIC_TRAITS, LandmarksWidget

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / ".agents" / "skills" / "use-milume" / "SKILL.md"
SCRIPTS = ROOT / "website" / "scripts"


def _load(name: str, path: Path):
    if str(path.parent) not in sys.path:
        sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _fixture():
    rng = np.random.default_rng(0)
    n = 200
    x = rng.uniform(0, 100, n)
    y = rng.uniform(0, 100, n)
    types = pd.Categorical(rng.choice(["enterocyte", "goblet", "stem"], n))
    return adata_xy(
        x, y, color=types, color_key="cell_type", genes={"APOB": rng.random(n)}
    )


def test_skill_examples_run_against_fixture():
    pytest.importorskip("geopandas")
    blocks = re.findall(
        r"```python\n(.*?)```", SKILL.read_text(encoding="utf-8"), re.DOTALL
    )
    assert len(blocks) >= 5
    ns: dict = {"adata": _fixture()}
    for block in blocks:
        exec(compile(block, str(SKILL), "exec"), ns)  # noqa: S102 - running the skill examples is the test
    w = ns["w"]
    assert isinstance(w, LandmarksWidget)
    assert w.color == "cell_type"
    assert len(ns["cells"]) > 0 and ns["adata"].obs["in_crypt"].sum() == len(
        ns["cells"]
    )
    assert set(ns["palette"]) == {"enterocyte", "goblet", "stem"}
    assert w.landmarks[0]["id"] == "crypt-axis"


def test_skill_public_api_block_is_current():
    out = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "sync-use-milume-skill.py"), "--check"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert out.returncode == 0, out.stdout + out.stderr


def test_registry_entries_exist():
    traits = LandmarksWidget.class_traits()
    for name in _PUBLIC_TRAITS:
        assert name in traits or callable(getattr(LandmarksWidget, name, None)), name


def test_api_page_lists_exactly_registry():
    codegen = _load("api_reference_codegen", SCRIPTS / "api_reference_codegen.py")
    assert codegen.public_registry() == _PUBLIC_TRAITS
    traits = set(LandmarksWidget.class_traits())
    table = codegen.render_traitlets_markdown()
    listed = set(re.findall(r"^\| `([a-z_0-9]+)` \|", table, re.MULTILINE))
    assert listed == {n for n in _PUBLIC_TRAITS if n in traits}
    methods = codegen.render_methods_markdown()
    headed = set(re.findall(r"^### `([a-z_0-9]+)\(\)`", methods, re.MULTILINE))
    assert headed == {n for n in _PUBLIC_TRAITS if n not in traits}


def test_llms_txt_lists_exactly_registry(tmp_path):
    index = _load("agent_index", SCRIPTS / "agent-index.py")
    landing = tmp_path / "index.md"
    landing.write_text("# milume\n", encoding="utf-8")
    index.write_llms(tmp_path, landing, [])
    text = (tmp_path / "llms.txt").read_text(encoding="utf-8")
    listed = set(re.findall(r"^- `([a-z_0-9]+)`: ", text, re.MULTILINE))
    assert listed == set(_PUBLIC_TRAITS)
