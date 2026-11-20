"""Recipe export stamp: same inputs reuse the export, any input change fails closed."""

from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def load():
    path = ROOT / "scripts" / "recipe_export_cache.py"
    spec = importlib.util.spec_from_file_location("recipe_export_cache", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cache = load()


def test_real_repo_key_covers_recipe_inputs_and_ignores_shot_lists():
    first = cache.cache_key(ROOT)
    second = cache.cache_key(ROOT)
    assert first == second
    assert len(first) == 64
    rels = {path.relative_to(ROOT).as_posix() for path in cache.key_files(ROOT)}
    assert "demos/recipes/squidpy_color.py" in rels
    assert "demos/recipes/squidpy_svg.py" in rels
    assert "demos/recipes/squidpy_color/numbers.json" in rels
    assert "demos/data/ileum.h5ad" in rels
    assert "uv.lock" in rels
    assert "scripts/verify_squidpy_color.py" in rels
    assert "scripts/verify_squidpy_svg.py" in rels
    assert any(rel.startswith("milume/") and rel.endswith(".py") for rel in rels)
    assert any(rel.startswith("frontend/src/") for rel in rels)
    assert not any(rel.endswith("shots.yaml") for rel in rels)
    assert not any("_marimo-studio" in rel or ".test." in rel for rel in rels)


def test_check_fails_closed_without_a_stamp():
    with pytest.raises(SystemExit, match="does not match inputs"):
        cache.check(ROOT)


def _fixture(tmp_path: Path) -> Path:
    for rel in cache.REQUIRED_FILES:
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"fixture {rel}\n", encoding="utf-8")
    (tmp_path / "demos/recipes").mkdir(parents=True, exist_ok=True)
    (tmp_path / "demos/recipes/squidpy_color.py").write_text(
        "color\n", encoding="utf-8"
    )
    (tmp_path / "demos/recipes/squidpy_svg.py").write_text("svg\n", encoding="utf-8")
    numbers = tmp_path / "demos/recipes/squidpy_color/numbers.json"
    numbers.parent.mkdir(parents=True, exist_ok=True)
    numbers.write_text("{}\n", encoding="utf-8")
    (tmp_path / "milume").mkdir(parents=True, exist_ok=True)
    (tmp_path / "milume/widgets.py").write_text("py\n", encoding="utf-8")
    src = tmp_path / "frontend/src/widget.ts"
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_text("ts\n", encoding="utf-8")
    shots = tmp_path / "demos/recipes/squidpy_color/shots.yaml"
    shots.parent.mkdir(parents=True, exist_ok=True)
    shots.write_text("shots: []\n", encoding="utf-8")
    return tmp_path


def _write_outputs(root: Path) -> None:
    for rel in cache.OUTPUTS:
        path = root / rel
        if path.suffix:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(rel + "\n", encoding="utf-8")
        else:
            path.mkdir(parents=True, exist_ok=True)
            (path / "marker.txt").write_text("ok\n", encoding="utf-8")


def test_stamp_restores_outputs_until_a_recipe_input_changes(tmp_path: Path):
    root = _fixture(tmp_path)
    _write_outputs(root)
    key = cache.cache_key(root)
    cache.pack(
        root, key, "Prepared committed\nPrepared reused\n", cache.hash_manifest(root)
    )
    marker = root / "website/content/how-to/recipes/squidpy_color/_marimo-studio"
    shutil.rmtree(marker)
    cache.check(root)
    assert (marker / "marker.txt").read_text(encoding="utf-8") == "ok\n"
    shots = root / "demos/recipes/squidpy_color/shots.yaml"
    shots.write_text("shots: [one]\n", encoding="utf-8")
    cache.check(root)
    generated = root / "demos/recipes/__marimo__/cache.py"
    generated.parent.mkdir()
    generated.write_text("generated during export\n", encoding="utf-8")
    cache.check(root)
    (root / "demos/recipes/squidpy_color.py").write_text(
        "color changed\n", encoding="utf-8"
    )
    with pytest.raises(SystemExit, match="does not match inputs"):
        cache.check(root)


def test_packing_twice_keeps_one_stamp(tmp_path: Path):
    root = _fixture(tmp_path)
    _write_outputs(root)
    cache.pack(
        root,
        cache.cache_key(root),
        "Prepared committed\nPrepared committed\n",
        cache.hash_manifest(root),
    )
    cache.pack(
        root,
        cache.cache_key(root),
        "Prepared committed\nPrepared committed\n",
        cache.hash_manifest(root),
    )
    assert cache.outputs_match(root)
    assert cache.read_stamp(root) == cache.cache_key(root)


def test_classify_runs_waits_fails_or_downloads_newest_success():
    assert cache.classify_runs([]) == ("wait", None)
    queued = {"status": "queued", "conclusion": None, "created_at": "1", "id": 1}
    assert cache.classify_runs([queued])[0] == "wait"
    failed = {
        "status": "completed",
        "conclusion": "failure",
        "created_at": "2",
        "id": 2,
    }
    action, run = cache.classify_runs([failed])
    assert action == "fail"
    assert run is not None and run["id"] == 2
    older = {"status": "completed", "conclusion": "success", "created_at": "1", "id": 3}
    newer = {"status": "completed", "conclusion": "success", "created_at": "3", "id": 4}
    action, run = cache.classify_runs([older, failed, newer])
    assert action == "download"
    assert run is not None and run["id"] == 4
    inflight = {"status": "in_progress", "conclusion": None, "created_at": "4", "id": 5}
    assert cache.classify_runs([failed, inflight])[0] == "wait"


def test_prepared_log_requires_both_recipes():
    cache.assert_prepared_log("Prepared committed\nPrepared reused\n")
    with pytest.raises(SystemExit, match="both recipes"):
        cache.assert_prepared_log("Prepared committed\n")
