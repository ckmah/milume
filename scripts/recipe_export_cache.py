#!/usr/bin/env python3
"""One squidpy recipe export per input hash, shared by the CI workflows.

The hash covers recipe code, the ileum dataset, milume, the widget sources,
uv.lock, and the export/verify scripts. A matching stamp means those inputs
already produced the packed site fragments and both verify scripts passed.
`check` fails closed when the stamp is missing or the inputs moved.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = (
    "pyproject.toml",
    "uv.lock",
    "demos/data/ileum.h5ad",
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/vite.config.ts",
    "website/scripts/export-recipes.sh",
    "website/scripts/prepare_recipe_studio.py",
    "website/scripts/recipe_widget_esm.py",
    "website/scripts/marimo_export_sitecustomize/sitecustomize.py",
    "scripts/verify_squidpy_color.py",
    "scripts/verify_squidpy_svg.py",
    "scripts/recipe_export_cache.py",
)

GLOBS = (
    "demos/recipes/**/*.py",
    "demos/recipes/**/*.json",
    "demos/recipes/**/*.toml",
    "demos/recipes/**/*.html",
    "milume/**/*.py",
    "frontend/src/**/*.ts",
    "frontend/src/**/*.tsx",
    "frontend/src/**/*.js",
    "frontend/src/**/*.mjs",
    "frontend/src/**/*.css",
)

MUST_INCLUDE = (
    "demos/recipes/squidpy_color.py",
    "demos/recipes/squidpy_svg.py",
    "demos/recipes/squidpy_color/numbers.json",
    "demos/data/ileum.h5ad",
    "uv.lock",
    "scripts/verify_squidpy_color.py",
    "scripts/verify_squidpy_svg.py",
)

OUTPUTS = (
    "website/content/how-to/recipes/squidpy_color/_marimo-studio",
    "website/content/how-to/recipes/squidpy_svg/_marimo-studio",
    "website/content/assets/marimo-studio-zero-python",
    "website/content/assets/recipe-widgets",
    "website/overrides/partials/recipe-studio-squidpy_color-head.html",
    "website/overrides/partials/recipe-studio-squidpy_color-body.html",
    "website/overrides/partials/recipe-studio-squidpy_svg-head.html",
    "website/overrides/partials/recipe-studio-squidpy_svg-body.html",
)

PREPARED_RE = re.compile(r"Prepared (reused|committed)")
BUNDLE_NAME = Path("website/.cache/recipe-export")


def find_repo(start: Path, cwd: Path) -> Path:
    """The checkout that holds this script.

    `uv run` can execute a copy of the file, so `__file__` may sit outside the
    repo. The process cwd is the checkout when assemble passes `--directory`.
    """
    for candidate in (start, *start.parents, cwd, *cwd.parents):
        if (candidate / "pyproject.toml").is_file() and (
            candidate / "uv.lock"
        ).is_file():
            return candidate
    raise SystemExit(f"recipe-compute: no checkout found from {start} or {cwd}")


def repo_root() -> Path:
    override = os.environ.get("MILUME_RECIPE_ROOT")
    if override:
        return Path(override).resolve()
    return find_repo(Path(__file__).resolve().parent, Path.cwd())


def bundle_dir(root: Path) -> Path:
    return root / BUNDLE_NAME


def _skip_key_path(path: Path) -> bool:
    if ".test." in path.name:
        return True
    # __marimo__ is the export cache. It appears during compute, so hashing it
    # makes the post-export tree disagree with a clean checkout.
    return any(
        part
        in {"__pycache__", "__marimo__", "_marimo-studio", "node_modules", ".cache"}
        for part in path.parts
    )


def key_files(root: Path) -> list[Path]:
    found: dict[str, Path] = {}
    missing = [rel for rel in REQUIRED_FILES if not (root / rel).is_file()]
    if missing:
        raise SystemExit("recipe-compute: missing key inputs: " + ", ".join(missing))
    for rel in REQUIRED_FILES:
        found[rel] = root / rel
    for pattern in GLOBS:
        for path in root.glob(pattern):
            if not path.is_file() or _skip_key_path(path.relative_to(root)):
                continue
            found[path.relative_to(root).as_posix()] = path
    rels = set(found)
    absent = [rel for rel in MUST_INCLUDE if rel not in rels]
    if not any(rel.startswith("frontend/src/") for rel in rels):
        absent.append("frontend/src/**")
    if not any(rel.startswith("milume/") and rel.endswith(".py") for rel in rels):
        absent.append("milume/**/*.py")
    if absent:
        raise SystemExit("recipe-compute: key inputs not covered: " + ", ".join(absent))
    return [found[rel] for rel in sorted(found)]


def cache_key(root: Path) -> str:
    digest = hashlib.sha256()
    for rel, file_hash in hash_manifest(root):
        digest.update(rel.encode())
        digest.update(b"\0")
        digest.update(file_hash.encode())
        digest.update(b"\0")
    return digest.hexdigest()


def hash_manifest(root: Path) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for path in key_files(root):
        rel = path.relative_to(root).as_posix()
        rows.append((rel, hashlib.sha256(path.read_bytes()).hexdigest()))
    return rows


def _safe_members(tar: tarfile.TarFile, root: Path) -> list[tarfile.TarInfo]:
    root = root.resolve()
    members: list[tarfile.TarInfo] = []
    for member in tar.getmembers():
        if member.issym() or member.islnk():
            raise SystemExit(
                f"recipe-compute: refusing link in export tar: {member.name}"
            )
        target = (root / member.name).resolve()
        if target != root and not str(target).startswith(str(root) + os.sep):
            raise SystemExit(
                f"recipe-compute: refusing path in export tar: {member.name}"
            )
        members.append(member)
    return members


def ensure_bundle_layout(root: Path) -> None:
    """Accept either a workspace-relative bundle or an artifact whose root is the bundle."""
    dest = bundle_dir(root)
    dest.mkdir(parents=True, exist_ok=True)
    if (dest / "key").is_file() and (dest / "bundle.tar").is_file():
        return
    search = [dest, dest / "recipe-export", root / "recipe-export", root]
    tars: list[Path] = []
    for directory in search:
        if not directory.is_dir():
            continue
        tars.extend(path for path in directory.glob("bundle.tar") if path.is_file())
        tars.extend(path for path in directory.glob("*/bundle.tar") if path.is_file())
    unique = []
    seen: set[Path] = set()
    for path in tars:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(path)
    if len(unique) != 1:
        return
    src = unique[0].parent
    for name in ("bundle.tar", "key", "export.log"):
        file = src / name
        target = dest / name
        if file.is_file() and file.resolve() != target.resolve():
            shutil.copy2(file, target)


def apply_tar(root: Path) -> None:
    tar_path = bundle_dir(root) / "bundle.tar"
    if not tar_path.is_file():
        raise SystemExit(f"recipe-compute: missing {tar_path}")
    with tarfile.open(tar_path) as tar:
        members = _safe_members(tar, root)
        if hasattr(tarfile, "data_filter"):
            tar.extractall(root, members=members, filter="data")
        else:
            tar.extractall(root, members=members)


def outputs_present(root: Path) -> bool:
    return all((root / rel).exists() for rel in OUTPUTS)


def read_stamp(root: Path) -> str:
    key_path = bundle_dir(root) / "key"
    if not key_path.is_file():
        return ""
    return key_path.read_text(encoding="utf-8").strip()


def outputs_match(root: Path) -> bool:
    stamped = read_stamp(root)
    return bool(stamped) and stamped == cache_key(root) and outputs_present(root)


def pack(root: Path, key: str, log: str, manifest: list[tuple[str, str]]) -> None:
    bundle = bundle_dir(root)
    bundle.mkdir(parents=True, exist_ok=True)
    missing = [rel for rel in OUTPUTS if not (root / rel).exists()]
    if missing:
        raise SystemExit(
            "recipe-compute: export outputs missing: " + ", ".join(missing)
        )
    tmp = bundle / "bundle.tar.tmp"
    with tarfile.open(tmp, "w") as tar:
        for rel in OUTPUTS:
            path = root / rel
            if path.is_symlink():
                raise SystemExit(f"recipe-compute: refusing symlink in export: {rel}")
            tar.add(path, arcname=rel, recursive=True)
    tmp.replace(bundle / "bundle.tar")
    log_tmp = bundle / "export.log.tmp"
    log_tmp.write_text(log, encoding="utf-8")
    log_tmp.replace(bundle / "export.log")
    key_tmp = bundle / "key.tmp"
    key_tmp.write_text(key + "\n", encoding="utf-8")
    key_tmp.replace(bundle / "key")
    manifest_tmp = bundle / "manifest.txt.tmp"
    manifest_tmp.write_text(
        "".join(f"{file_hash} {rel}\n" for rel, file_hash in manifest),
        encoding="utf-8",
    )
    manifest_tmp.replace(bundle / "manifest.txt")


def _run(cmd: list[str], root: Path) -> str:
    print("+ " + " ".join(cmd), flush=True)
    proc = subprocess.Popen(
        cmd,
        cwd=root,
        env=os.environ.copy(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    chunks: list[str] = []
    assert proc.stdout is not None
    for line in proc.stdout:
        print(line, end="", flush=True)
        chunks.append(line)
    code = proc.wait()
    if code != 0:
        raise SystemExit(code)
    return "".join(chunks)


def assert_prepared_log(log: str) -> None:
    found = PREPARED_RE.findall(log)
    if len(found) < 2:
        tail = "\n".join(log.splitlines()[-40:])
        raise SystemExit(
            "recipe-compute: expected 'Prepared reused' or 'Prepared committed' "
            f"for both recipes, found {len(found)}\n{tail}"
        )


def assert_views(root: Path) -> None:
    scripts = root / "website" / "scripts"
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))
    from recipe_widget_esm import assert_no_embedded_widget_esm

    color_views = (
        root / "website/content/how-to/recipes/squidpy_color/_marimo-studio/views"
    )
    if not color_views.is_dir():
        raise SystemExit(f"recipe-compute: missing {color_views}")
    expected = "niche_k64"
    seen = False
    for path in color_views.rglob("*.cell.json"):
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if data.get("cell", {}).get("name") != "landmark_map":
            continue
        seen = True
        color = _initial_color_column(raw)
        console = data.get("console") or []
        if color != expected:
            raise SystemExit(f"recipe-compute: initial color column={color!r}")
        if console:
            raise SystemExit(
                f"recipe-compute: landmark_map console not empty: {console!r}"
            )
    if not seen:
        raise SystemExit(
            "recipe-compute: landmark_map cell json not in the color export"
        )
    for slug in ("squidpy_color", "squidpy_svg"):
        views = root / f"website/content/how-to/recipes/{slug}/_marimo-studio/views"
        if views.is_dir():
            assert_no_embedded_widget_esm(views)
    log_path = bundle_dir(root) / "export.log"
    if log_path.is_file():
        assert_prepared_log(log_path.read_text(encoding="utf-8"))
    print("recipe-compute: view assertions ok", flush=True)


def _initial_color_column(raw: str) -> str:
    match = re.search(r'"color"\s*:\s*"([^"]+)"', raw)
    if match:
        return match.group(1)
    match = re.search(r'"active_category"\s*:\s*"([^"]+)"', raw)
    return match.group(1) if match else ""


def compute(root: Path) -> None:
    manifest = hash_manifest(root)
    key = cache_key(root)
    if outputs_match(root):
        print(f"recipe-compute: export already stamped {key}", flush=True)
        return
    print(f"recipe-compute: cache miss {key}, computing export and verify", flush=True)
    stale_log = bundle_dir(root) / "export.log"
    stale_log.unlink(missing_ok=True)
    started = time.perf_counter()
    log = _run(
        ["bash", "website/scripts/export-recipes.sh", "prepare-for-zensical"], root
    )
    print(f"recipe-compute: export {time.perf_counter() - started:.0f}s", flush=True)
    assert_prepared_log(log)
    assert_views(root)
    verify_started = time.perf_counter()
    log += _run(["uv", "run", "python", "scripts/verify_squidpy_color.py"], root)
    log += _run(["uv", "run", "python", "scripts/verify_squidpy_svg.py"], root)
    print(
        f"recipe-compute: verify {time.perf_counter() - verify_started:.0f}s",
        flush=True,
    )
    pack(root, key, log, manifest)
    print(f"recipe-compute: packed {key}", flush=True)


def explain_stamp_mismatch(root: Path, stamped: str, key: str) -> str:
    manifest_path = bundle_dir(root) / "manifest.txt"
    if not manifest_path.is_file():
        return f"recipe-compute: stamp {stamped or '(missing)'} does not match inputs {key}"
    saved = {}
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        file_hash, _, rel = line.partition(" ")
        if rel:
            saved[rel] = file_hash
    current = dict(hash_manifest(root))
    added = sorted(set(current) - set(saved))
    removed = sorted(set(saved) - set(current))
    changed = sorted(
        rel for rel in set(saved) & set(current) if saved[rel] != current[rel]
    )
    detail = []
    if added:
        detail.append("added " + ", ".join(added[:20]))
    if removed:
        detail.append("removed " + ", ".join(removed[:20]))
    if changed:
        detail.append("changed " + ", ".join(changed[:20]))
    extra = "; ".join(detail) if detail else "no path diff"
    return f"recipe-compute: stamp {stamped or '(missing)'} does not match inputs {key} ({extra})"


def check(root: Path) -> None:
    ensure_bundle_layout(root)
    key = cache_key(root)
    stamped = read_stamp(root)
    if stamped != key:
        raise SystemExit(explain_stamp_mismatch(root, stamped, key))
    apply_tar(root)
    if not outputs_present(root):
        missing = [rel for rel in OUTPUTS if not (root / rel).exists()]
        raise SystemExit(
            "recipe-compute: stamped export is incomplete: " + ", ".join(missing)
        )
    print(f"recipe-compute: export ready {key}", flush=True)


def classify_runs(runs: list[dict]) -> tuple[str, dict | None]:
    """Decide how a consumer treats recipe-compute runs for this SHA.

    `download` a successful run, `wait` while one is still open, or `fail`
    when every run has finished unsuccessfully.
    """
    ok = [
        r
        for r in runs
        if r.get("status") == "completed" and r.get("conclusion") == "success"
    ]
    if ok:
        ok.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        return "download", ok[0]
    if not runs or any(r.get("status") != "completed" for r in runs):
        return "wait", None
    failed = sorted(runs, key=lambda r: r.get("created_at") or "", reverse=True)
    return "fail", failed[0]


def _github_json(url: str, token: str) -> object:
    import json
    from urllib.error import HTTPError
    from urllib.request import Request, urlopen

    req = Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "milume-recipe-compute",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except HTTPError as exc:
        if exc.code == 403:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise SystemExit(
                f"recipe-compute: GitHub API 403 for {url}: {detail}"
            ) from exc
        raise


class _DropAuthOnRedirect(urllib.request.HTTPRedirectHandler):
    """Artifact downloads redirect to blob storage. That host rejects the GitHub token."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None:
            redirected.remove_header("Authorization")
        return redirected


def _download_zip(url: str, token: str, dest: Path) -> None:
    from urllib.error import HTTPError
    from urllib.request import Request, build_opener

    req = Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "milume-recipe-compute",
        },
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with build_opener(_DropAuthOnRedirect).open(req, timeout=120) as resp, dest.open("wb") as out:
            shutil.copyfileobj(resp, out)
    except HTTPError as exc:
        if exc.code == 403:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise SystemExit(
                f"recipe-compute: GitHub API 403 for {url}: {detail}"
            ) from exc
        raise


def _extract_zip(zip_path: Path, root: Path) -> None:
    root = root.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            target = (root / info.filename).resolve()
            if target != root and not str(target).startswith(str(root) + os.sep):
                raise SystemExit(
                    f"recipe-compute: refusing path in artifact zip: {info.filename}"
                )
        zf.extractall(root)


def producer_sha() -> str:
    return os.environ.get("RECIPE_HEAD_SHA") or os.environ["GITHUB_SHA"]


def wait_for_producer(root: Path, *, attempts: int = 80, pause_s: float = 15) -> None:
    repo = os.environ["GITHUB_REPOSITORY"]
    sha = producer_sha()
    token = os.environ["GH_TOKEN"]
    api = f"https://api.github.com/repos/{repo}"
    for attempt in range(1, attempts + 1):
        payload = _github_json(f"{api}/actions/runs?head_sha={sha}&per_page=20", token)
        runs = [
            run
            for run in payload.get("workflow_runs", [])
            if str(run.get("path", "")).endswith("recipe-compute.yml")
        ]
        action, run = classify_runs(runs)
        if action == "wait":
            print(
                f"recipe-compute: waiting for recipe-compute.yml on {sha[:12]} "
                f"(attempt {attempt}/{attempts})",
                flush=True,
            )
            time.sleep(pause_s)
            continue
        if action == "fail":
            url = (run or {}).get("html_url", "")
            raise SystemExit(f"recipe-compute: producer failed: {url}")
        assert run is not None
        run_id = run["id"]
        artifacts = _github_json(f"{api}/actions/runs/{run_id}/artifacts", token)
        match = next(
            (
                item
                for item in artifacts.get("artifacts", [])
                if item.get("name") == "recipe-export"
            ),
            None,
        )
        if match is None or match.get("expired"):
            print(
                f"recipe-compute: run {run_id} has no recipe-export artifact yet",
                flush=True,
            )
            time.sleep(pause_s)
            continue
        zip_path = bundle_dir(root) / "artifact.zip"
        _download_zip(match["archive_download_url"], token, zip_path)
        _extract_zip(zip_path, bundle_dir(root))
        zip_path.unlink(missing_ok=True)
        print(
            f"recipe-compute: reused export from run {run_id} key {cache_key(root)}",
            flush=True,
        )
        return
    raise SystemExit("recipe-compute: timed out waiting for recipe-compute.yml")


def main(argv: list[str]) -> int:
    root = repo_root()
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "key":
        print(cache_key(root))
        return 0
    if cmd == "check":
        check(root)
        return 0
    if cmd == "compute":
        compute(root)
        return 0
    if cmd == "assert-views":
        check(root)
        assert_views(root)
        return 0
    if cmd == "wait":
        wait_for_producer(root)
        check(root)
        return 0
    print(
        "usage: recipe_export_cache.py key|check|compute|assert-views|wait",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
