"""Each demos/*.py PEP 723 header lists every third-party package the notebook imports.

There is no published ``demo`` extra: molab and ``marimo edit --sandbox`` install a
demo's dependencies from its own inline script header, so a missing entry breaks it.
"""

import ast
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DEMOS = sorted((ROOT / "demos").glob("*.py"))

# PEP 723 reference regex.
HEADER = re.compile(
    r"(?m)^# /// (?P<type>[a-zA-Z0-9-]+)$\s(?P<content>(^#(| .*)$\s)+)^# ///$"
)

# Import name -> distribution name, where they differ beyond `_` vs `-`.
DIST_FOR_IMPORT = {
    "sklearn": "scikit-learn",
    "skimage": "scikit-image",
    "PIL": "pillow",
    "yaml": "pyyaml",
}

# Packages a call needs without importing them at the call site.
CALL_NEEDS = {
    "sc.tl.leiden": "leidenalg",
    "scanpy.tl.leiden": "leidenalg",
}


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _header_deps(src: str) -> set[str]:
    import tomllib

    blocks = [m for m in HEADER.finditer(src) if m.group("type") == "script"]
    assert len(blocks) == 1, "expected exactly one `# /// script` header"
    body = "".join(
        line[2:] if line.startswith("# ") else line[1:]
        for line in blocks[0].group("content").splitlines(keepends=True)
    )
    deps = tomllib.loads(body).get("dependencies", [])
    return {_norm(re.split(r"[\s;<>=!~\[@]", d.strip(), maxsplit=1)[0]) for d in deps}


def _imported_dists(src: str) -> set[str]:
    out = set()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, ast.Import):
            mods = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom) and not node.level:
            mods = [node.module or ""]
        else:
            continue
        for mod in mods:
            top = mod.split(".")[0]
            if top and top not in sys.stdlib_module_names and top != "__future__":
                out.add(_norm(DIST_FOR_IMPORT.get(top, top)))
    return out


def _missing(src: str) -> list[str]:
    needed = _imported_dists(src)
    needed |= {pkg for call, pkg in CALL_NEEDS.items() if call + "(" in src}
    return sorted(needed - _header_deps(src))


def test_demos_exist():
    assert DEMOS, "expected at least one marimo demo under demos/"


@pytest.mark.parametrize("path", DEMOS, ids=lambda p: p.name)
def test_demo_header_covers_imports(path: Path):
    missing = _missing(path.read_text())
    assert not missing, f"{path.name}: PEP 723 header is missing {missing}"


def test_checker_catches_a_missing_package():
    src = (
        "# /// script\n"
        "# dependencies = [\n"
        '#     "marimo",\n'
        '#     "scanpy",\n'
        "# ]\n"
        "# ///\n"
        "import marimo\nimport scanpy as sc\nimport tempfile\nsc.tl.leiden(adata)\n"
    )
    assert _missing(src) == ["leidenalg"]
    assert _missing(
        src.replace("import marimo\n", "import marimo\nimport squidpy\n")
    ) == [
        "leidenalg",
        "squidpy",
    ]
