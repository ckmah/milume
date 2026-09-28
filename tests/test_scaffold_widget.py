"""scripts/scaffold_widget.py: new anywidget scaffolds wired into the repo."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import scaffold_widget as sw  # noqa: E402


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    (root / "frontend" / "src" / "widgets").mkdir(parents=True)
    (root / "spatial_rx").mkdir()
    (root / "demos").mkdir()
    (root / "frontend" / "vite.config.ts").write_text(
        'const widgetEntries = {\n  gallery: path.resolve(rootDir, "src/widgets/gallery/index.tsx"),\n};\n',
        encoding="utf-8",
    )
    (root / "spatial_rx" / "__init__.py").write_text(
        "from .landmarks import LandmarksWidget\n\n"
        '__all__ = ["LandmarksWidget", "__version__"]\n',
        encoding="utf-8",
    )
    return root


def _filter_form():
    return sw.build_spec_from_cli(
        "filter-form",
        class_name=None,
        traitlets=[
            "values:Dict={}",
            "submitted:Bool=false",
            "pos:Tuple[Int,Int,Int]=[0,0,0]",
            'color:Unicode="#ff2d95"',
        ],
        docstring="Filter form",
    )


def test_scaffold_generates_a_widget_wired_into_the_repo(repo: Path):
    sw.scaffold(_filter_form(), repo_root=repo, demo=True, force=False)

    widget_dir = repo / "frontend/src/widgets/filter-form"
    assert (widget_dir / "index.tsx").is_file()
    assert (repo / "demos/filter-form.py").is_file()
    py = (repo / "spatial_rx/filter_form.py").read_text(encoding="utf-8")
    assert "class FilterFormWidget(AnyWidget):" in py
    assert 'widget_esm("filter-form")' in py
    assert "values = traitlets.Dict()" in py
    assert "submitted = traitlets.Bool()" in py
    assert "#ff2d95" in py
    tsx = (widget_dir / "FilterFormView.tsx").read_text(encoding="utf-8")
    for key in ("values", "submitted", "pos", "color"):
        assert f'"{key}",' in tsx
    vite = (repo / "frontend/vite.config.ts").read_text(encoding="utf-8")
    assert "widgets/filter-form/index.tsx" in vite and "widgets/gallery/index.tsx" in vite
    init = (repo / "spatial_rx/__init__.py").read_text(encoding="utf-8")
    assert "from .filter_form import FilterFormWidget" in init
    assert init.index("FilterFormWidget") < init.index("__version__")


def test_scaffold_refuses_overwrite_and_force_does_not_duplicate_wiring(repo: Path):
    sw.scaffold(_filter_form(), repo_root=repo, demo=False, force=False)
    with pytest.raises(FileExistsError):
        sw.scaffold(_filter_form(), repo_root=repo, demo=False, force=False)

    sw.scaffold(_filter_form(), repo_root=repo, demo=False, force=True)
    vite = (repo / "frontend/vite.config.ts").read_text(encoding="utf-8")
    init = (repo / "spatial_rx/__init__.py").read_text(encoding="utf-8")
    assert vite.count("widgets/filter-form/index.tsx") == 1
    assert init.count("from .filter_form import FilterFormWidget") == 1


def test_scaffold_from_the_gallery_yaml_spec(repo: Path):
    spec = sw.load_yaml_spec(ROOT / "widgets" / "gallery.yaml")
    assert spec.class_name == "GalleryWidget"
    assert [t.name for t in spec.traitlets] == ["items", "selected_index", "columns"]
    sw.scaffold(spec, repo_root=repo, demo=False, force=False)
    py = (repo / "spatial_rx/gallery.py").read_text(encoding="utf-8")
    assert "selected_index = traitlets." in py
