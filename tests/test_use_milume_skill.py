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
from helpers import adata_xy, toy_spatialdata

from milume.landmarks import _PUBLIC_TRAITS, LandmarksWidget

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "use-milume" / "SKILL.md"
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


def test_skill_examples_run_against_fixture(tmp_path):
    pytest.importorskip("geopandas")

    skill_text = SKILL.read_text(encoding="utf-8")
    blocks = re.findall(
        r"```python\n(.*?)```", skill_text, re.DOTALL
    )
    assert len(blocks) >= 5
    ns: dict = {"adata": _fixture(), "sdata": toy_spatialdata(tmp_path / "toy.zarr")}
    for block in blocks:
        if "squidpy as sq" in block:
            pytest.importorskip("squidpy")
            pytest.importorskip("scanpy")
        exec(compile(block, str(SKILL), "exec"), ns)  # noqa: S102 - running the skill examples is the test
    w = ns["w"]
    assert isinstance(w, LandmarksWidget)
    assert w.color == "cell_type"
    assert len(ns["cells"]) > 0 and ns["adata"].obs["in_crypt"].sum() == len(
        ns["cells"]
    )
    assert set(ns["palette"]) == {"enterocyte", "goblet", "stem"}
    assert w.landmarks[0]["id"] == "crypt-axis"
    v = ns["v"]
    assert (v.inspect_cx, v.inspect_cy, v.inspect_open) == (150.0, 140.0, False)
    assert v.volume_cut[4:] == [0.0, 32.0]


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
    assert "use-milume" in text
    assert "skills/use-milume/SKILL.md" in text


def test_wheel_ships_skill(tmp_path):
    import shutil
    import zipfile

    if shutil.which("uv") is None:
        pytest.skip("uv not installed")
    subprocess.run(
        ["uv", "build", "--wheel", "--out-dir", str(tmp_path), str(ROOT)],
        check=True,
        capture_output=True,
    )
    (wheel,) = tmp_path.glob("milume-*.whl")
    with zipfile.ZipFile(wheel) as zf:
        shipped = zf.read("milume/skills/use-milume/SKILL.md").decode("utf-8")
    assert shipped == SKILL.read_text(encoding="utf-8")


def test_sdist_ships_skill(tmp_path):
    import shutil
    import tarfile

    if shutil.which("uv") is None:
        pytest.skip("uv not installed")
    subprocess.run(
        ["uv", "build", "--sdist", "--out-dir", str(tmp_path), str(ROOT)],
        check=True,
        capture_output=True,
    )
    (sdist,) = tmp_path.glob("milume-*.tar.gz")
    with tarfile.open(sdist, "r:gz") as tf:
        names = [n for n in tf.getnames() if n.endswith("skills/use-milume/SKILL.md")]
        assert len(names) == 1, names
        shipped = tf.extractfile(names[0]).read().decode("utf-8")
    assert shipped == SKILL.read_text(encoding="utf-8")


def test_skill_module_from_wheel(tmp_path):
    import shutil

    if shutil.which("uv") is None:
        pytest.skip("uv not installed")
    subprocess.run(
        ["uv", "build", "--wheel", "--out-dir", str(tmp_path), str(ROOT)],
        check=True,
        capture_output=True,
    )
    (wheel,) = tmp_path.glob("milume-*.whl")
    venv = tmp_path / "venv"
    subprocess.run(
        ["uv", "venv", str(venv), "--seed"],
        check=True,
        capture_output=True,
    )
    py = venv / "bin" / "python"
    subprocess.run(
        ["uv", "pip", "install", "--python", str(py), str(wheel)],
        check=True,
        capture_output=True,
    )
    path_out = subprocess.run(
        [str(py), "-m", "milume.skill"],
        check=True,
        capture_output=True,
        text=True,
    )
    printed = Path(path_out.stdout.strip())
    assert printed.is_file()
    assert printed.name == "SKILL.md"
    assert printed.read_text(encoding="utf-8") == SKILL.read_text(encoding="utf-8")

    dest = tmp_path / "agent-skills"
    install_out = subprocess.run(
        [str(py), "-m", "milume.skill", "install", str(dest)],
        check=True,
        capture_output=True,
        text=True,
    )
    installed = Path(install_out.stdout.strip())
    assert installed == dest / "use-milume" / "SKILL.md"
    assert installed.read_text(encoding="utf-8") == SKILL.read_text(encoding="utf-8")

    refuse = subprocess.run(
        [str(py), "-m", "milume.skill", "install", str(dest)],
        capture_output=True,
        text=True,
    )
    assert refuse.returncode != 0
    assert "already exists" in refuse.stderr

    subprocess.run(
        [str(py), "-m", "milume.skill", "install", str(dest), "--force"],
        check=True,
        capture_output=True,
        text=True,
    )
