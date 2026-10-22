"""Core install surface: leidenalg is demo-only, no published demo extra, pyarrow is declared, spatialdata has a working floor."""

import ast
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYPROJECT = tomllib.loads((ROOT / "pyproject.toml").read_text())


def _names(reqs: list[str]) -> dict[str, str]:
    out = {}
    for req in reqs:
        name = req.split(";")[0]
        for sep in (">=", "==", "<", ">", "~=", "["):
            name = name.split(sep)[0]
        out[name.strip().lower()] = req
    return out


def test_leidenalg_is_demo_only():
    core = _names(PYPROJECT["project"]["dependencies"])
    demo = _names(PYPROJECT["dependency-groups"]["demo"])
    assert "leidenalg" not in core
    assert "leidenalg" in demo


def test_demo_is_a_dependency_group_not_a_published_extra():
    # Demo notebooks carry their own PEP 723 headers; nothing demo-only ships in PyPI metadata.
    assert "demo" not in PYPROJECT["project"].get("optional-dependencies", {})
    assert "marimo" in _names(PYPROJECT["dependency-groups"]["demo"])


def test_pyarrow_and_spatialdata_floor_are_declared():
    core = _names(PYPROJECT["project"]["dependencies"])
    assert core["pyarrow"] == "pyarrow>=16"
    assert "geopandas" in core


def test_spatialdata_floor_is_anndata_013_safe_on_py312():
    # anndata 0.13 needs Python >= 3.12 and breaks spatialdata 0.7.3
    # (TableModel.parse); 0.8.0 is the first release that works with it (#315).
    # 3.11 can't get anndata 0.13 or spatialdata 0.8.0, so it keeps 0.7.3.
    for reqs in (
        PYPROJECT["project"]["dependencies"],
        PYPROJECT["project"]["optional-dependencies"]["test"],
        PYPROJECT["dependency-groups"]["dev"],
    ):
        sd = sorted(r for r in reqs if r.split(">=")[0].strip() == "spatialdata")
        assert sd == [
            "spatialdata>=0.7.3; python_version < '3.12'",
            "spatialdata>=0.8.0; python_version >= '3.12'",
        ]


def test_milume_sources_never_import_leidenalg_or_igraph():
    for path in (ROOT / "milume").rglob("*.py"):
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                mods = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                mods = [node.module or ""]
            else:
                continue
            for mod in mods:
                assert mod.split(".")[0] not in {"leidenalg", "igraph"}, (
                    f"{path}: imports {mod}"
                )


def test_peek_works_without_leidenalg_or_igraph():
    code = """
import sys
class Block:
    def find_spec(self, name, path=None, target=None):
        if name.split('.')[0] in ('leidenalg', 'igraph'):
            raise ModuleNotFoundError(f"No module named {name!r}")
sys.meta_path.insert(0, Block())
import numpy as np, pandas as pd, anndata as ad
import milume
adata = ad.AnnData(
    X=np.ones((3, 2), dtype=np.float32),
    obs=pd.DataFrame({"cell_type": pd.Categorical(["a", "b", "a"])}, index=["c0", "c1", "c2"]),
)
adata.obsm["spatial"] = np.array([[0.0, 0.0], [1.0, 1.0], [2.0, 0.0]])
w = milume.peek(adata, color="cell_type")
assert w.color == "cell_type"
assert not {"leidenalg", "igraph"} & set(sys.modules)
print("ok")
"""
    res = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    assert res.returncode == 0, res.stderr
    assert res.stdout.strip().endswith("ok")
