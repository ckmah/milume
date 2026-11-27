"""Recipe export stamp: same inputs reuse the export, any input change fails closed."""

from __future__ import annotations

import hashlib
import importlib.util
import json
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
    compute_rels = {rel for rel, _hash in cache.hash_manifest(ROOT, include="compute")}
    assert "milume/landmarks.py" in compute_rels
    assert "uv.lock" in compute_rels
    assert "demos/data/ileum.h5ad" in compute_rels
    assert "scripts/verify_squidpy_color.py" in compute_rels
    assert "scripts/verify_squidpy_svg.py" in compute_rels
    assert "frontend/vite.config.ts" not in compute_rels
    assert not any(rel.startswith("frontend/src/") for rel in compute_rels)
    assert cache.compute_key(ROOT) != cache.cache_key(ROOT)
    assert not any(rel.endswith("shots.yaml") for rel in rels)
    assert not any("_marimo-studio" in rel or ".test." in rel for rel in rels)


def test_find_repo_uses_cwd_when_the_script_copy_is_outside_the_checkout(
    tmp_path: Path,
):
    checkout = tmp_path / "checkout"
    checkout.mkdir()
    (checkout / "pyproject.toml").write_text("[project]\nname='x'\n", encoding="utf-8")
    (checkout / "uv.lock").write_text("lock\n", encoding="utf-8")
    copy = tmp_path / "uv-copy" / "recipe_export_cache.py"
    copy.parent.mkdir()
    copy.write_text("x\n", encoding="utf-8")
    assert cache.find_repo(copy.parent, checkout) == checkout
    assert cache.find_repo(ROOT / "scripts", Path("/tmp")) == ROOT


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


def test_artifact_redirect_drops_the_github_token():
    from urllib.request import Request

    handler = cache._DropAuthOnRedirect()
    req = Request(
        "https://api.github.com/repos/ckmah/milume/actions/artifacts/1/zip",
        headers={"Authorization": "Bearer secret"},
    )
    redirected = handler.redirect_request(
        req, None, 302, "Found", {}, "https://blob.example/zip"
    )
    assert redirected is not None
    assert redirected.get_header("Authorization") is None
    assert redirected.full_url == "https://blob.example/zip"


def test_wait_queries_the_pull_request_head_not_the_merge_commit(monkeypatch, tmp_path):
    seen: list[str] = []

    def fake(url, token):
        seen.append(url)
        raise SystemExit("stop")

    monkeypatch.setenv("GITHUB_REPOSITORY", "ckmah/milume")
    monkeypatch.setenv("GITHUB_SHA", "mergesha")
    monkeypatch.setenv("RECIPE_HEAD_SHA", "headsha")
    monkeypatch.setenv("GH_TOKEN", "t")
    monkeypatch.setattr(cache, "_github_json", fake)
    with pytest.raises(SystemExit, match="stop"):
        cache.wait_for_producer(tmp_path, attempts=1, pause_s=0)
    assert "head_sha=headsha" in seen[0]


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


def test_widget_asset_filename_matches_the_hoist_helper():
    import sys

    scripts = str(ROOT / "website" / "scripts")
    sys.path.insert(0, scripts)
    from recipe_widget_esm import widget_asset_filename

    raw = b"export default 1\n"
    assert cache._widget_asset_filename(raw) == widget_asset_filename(raw)


def test_compute_key_ignores_frontend_and_tracks_recipe_inputs(tmp_path: Path):
    root = _fixture(tmp_path)
    base = cache.compute_key(root)
    full = cache.cache_key(root)
    (root / "frontend/src/widget.ts").write_text("ui\n", encoding="utf-8")
    assert cache.compute_key(root) == base
    assert cache.cache_key(root) != full
    (root / "frontend/package-lock.json").write_text("lockfile\n", encoding="utf-8")
    (root / "frontend/vite.config.ts").write_text("vite\n", encoding="utf-8")
    assert cache.compute_key(root) == base
    (root / "uv.lock").write_text("uv changed\n", encoding="utf-8")
    assert cache.compute_key(root) != base
    moved = cache.compute_key(root)
    (root / "milume/widgets.py").write_text("py changed\n", encoding="utf-8")
    assert cache.compute_key(root) != moved
    moved = cache.compute_key(root)
    (root / "scripts/verify_squidpy_svg.py").write_text("verify changed\n", encoding="utf-8")
    assert cache.compute_key(root) != moved
    moved = cache.compute_key(root)
    (root / "demos/data/ileum.h5ad").write_bytes(b"ileum-changed")
    assert cache.compute_key(root) != moved
    moved = cache.compute_key(root)
    (root / "demos/recipes/squidpy_color.py").write_text("recipe changed\n", encoding="utf-8")
    assert cache.compute_key(root) != moved


def test_compute_runs_export_and_both_verify_scripts(tmp_path: Path, monkeypatch):
    root = _fixture(tmp_path)
    _write_outputs(root)
    calls: list[list[str]] = []

    def fake(cmd, _root):
        calls.append(cmd)
        return "Prepared committed\nPrepared reused\n"

    monkeypatch.setattr(cache, "_run", fake)
    monkeypatch.setattr(cache, "assert_views", lambda _root: None)
    cache.compute(root)
    flat = [" ".join(cmd) for cmd in calls]
    assert any("export-recipes.sh" in item and "prepare-for-zensical" in item for item in flat)
    assert any("verify_squidpy_color.py" in item for item in flat)
    assert any("verify_squidpy_svg.py" in item for item in flat)
    assert cache.read_stamp(root) == cache.cache_key(root)
    assert cache.read_compute_stamp(root) == cache.compute_key(root)


def _hoist(root: Path, esm: bytes, css: str, md5: str) -> str:
    name = cache._widget_asset_filename(esm)
    asset = root / "website/content/assets/recipe-widgets"
    asset.mkdir(parents=True, exist_ok=True)
    (asset / name).write_bytes(esm)
    cell = (
        root
        / "website/content/how-to/recipes/squidpy_color/_marimo-studio/views/landmark_map.cell.json"
    )
    cell.parent.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256(esm).hexdigest()
    cell.write_text(
        json.dumps(
            {
                "n": 1.25,
                "resources": {
                    "files": {
                        f"/@file/4-anywidget-{sha}.js": f"../../../assets/recipe-widgets/{name}",
                    }
                },
                "esm_spec": {"hash": md5, "url": f"./@file/4-anywidget-{sha}.js"},
                "state": {"_css": css, "keep": "1.25"},
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    head = root / "website/overrides/partials/recipe-studio-squidpy_color-head.html"
    head.write_text(
        f'<link href="../../../assets/recipe-widgets/{name}">\n',
        encoding="utf-8",
    )
    return name


def test_repack_swaps_widget_bytes_and_fails_closed_on_a_stale_compute_stamp(
    tmp_path: Path, monkeypatch
):
    root = _fixture(tmp_path)
    _write_outputs(root)
    old = b"export const old=1\n"
    old_md5 = hashlib.md5(old).hexdigest()
    old_name = _hoist(root, old, "old css", old_md5)
    cache.pack(
        root,
        cache.cache_key(root),
        "Prepared committed\nPrepared reused\n",
        cache.hash_manifest(root),
    )
    compute_before = cache.compute_key(root)
    (root / "frontend/src/widget.ts").write_text("frontend changed\n", encoding="utf-8")
    assert cache.compute_key(root) == compute_before
    assert cache.read_stamp(root) != cache.cache_key(root)
    new = b"export const new=2\n"
    new_css = 'body{content:"x"}\n'
    bundled = root / "milume/static/bundled"
    bundled.mkdir(parents=True)
    (bundled / "landmarks.mjs").write_bytes(new)
    (bundled / "widgets.css").write_text(new_css, encoding="utf-8")
    monkeypatch.setattr(cache, "rebuild_widget", lambda _root: None)
    monkeypatch.setattr(
        cache,
        "_run",
        lambda cmd, _root: (_ for _ in ()).throw(AssertionError(cmd)),
    )
    cache.repack(root)
    assert cache.read_stamp(root) == cache.cache_key(root)
    assert cache.read_compute_stamp(root) == compute_before
    new_name = cache._widget_asset_filename(new)
    cell = (
        root
        / "website/content/how-to/recipes/squidpy_color/_marimo-studio/views/landmark_map.cell.json"
    )
    raw = cell.read_text(encoding="utf-8")
    old_sha = hashlib.sha256(old).hexdigest()
    assert f"/@file/4-anywidget-{old_sha}.js" in raw
    assert new_name in raw
    assert old_name not in raw
    assert "1.25" in raw
    data = json.loads(raw)
    assert data["n"] == 1.25
    assert data["state"]["_css"] == new_css
    assert data["state"]["keep"] == "1.25"
    assert data["esm_spec"]["hash"] == hashlib.md5(new).hexdigest()
    assert data["esm_spec"]["url"] == f"./@file/4-anywidget-{old_sha}.js"
    head = (
        root / "website/overrides/partials/recipe-studio-squidpy_color-head.html"
    ).read_text(encoding="utf-8")
    assert new_name in head
    assert not (root / "website/content/assets/recipe-widgets" / old_name).exists()
    cell.unlink()
    cache.check(root)
    assert new_name in cell.read_text(encoding="utf-8")
    (root / "demos/data/ileum.h5ad").write_bytes(b"changed-ileum")
    with pytest.raises(SystemExit, match="compute stamp"):
        cache.repack(root)
    with pytest.raises(SystemExit, match="does not match inputs"):
        cache.check(root)


def test_repack_fails_closed_without_a_compute_stamp(tmp_path: Path):
    root = _fixture(tmp_path)
    with pytest.raises(SystemExit, match="compute stamp"):
        cache.repack(root)
