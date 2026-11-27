#!/usr/bin/env python3
"""One squidpy recipe export per input hash, shared by the CI workflows.

The compute hash covers recipe code, the ileum dataset, milume Python,
uv.lock, and the export/verify scripts. It does not cover the widget
sources: those only change the hoisted ESM and CSS, which `repack` rebuilds
onto a compute-cache hit. The stamp `check` compares is the full hash
(compute inputs plus frontend sources). `check` fails closed when that
stamp is missing or any input moved.
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


FRONTEND_FILES = frozenset(
    {
        "frontend/package.json",
        "frontend/package-lock.json",
        "frontend/vite.config.ts",
    }
)

_LANDMARKS_ASSET = re.compile(r"landmarks-[0-9a-f]{64}\.mjs")


def _is_frontend_input(rel: str) -> bool:
    """Widget bundle inputs. Squidpy numbers do not read these files."""
    return rel in FRONTEND_FILES or rel.startswith("frontend/src/")


def _digest(rows: list[tuple[str, str]]) -> str:
    digest = hashlib.sha256()
    for rel, file_hash in rows:
        digest.update(rel.encode())
        digest.update(b"\0")
        digest.update(file_hash.encode())
        digest.update(b"\0")
    return digest.hexdigest()


def cache_key(root: Path) -> str:
    """Full stamp: compute inputs and frontend sources."""
    return _digest(hash_manifest(root))


def compute_key(root: Path) -> str:
    """Hash of the inputs that change squidpy numbers or prepared widget state."""
    rows = hash_manifest(root, include="compute")
    if not rows:
        raise SystemExit("recipe-compute: compute key is empty")
    return _digest(rows)


def hash_manifest(root: Path, *, include: str = "all") -> list[tuple[str, str]]:
    if include not in {"all", "compute", "frontend"}:
        raise SystemExit(f"recipe-compute: unknown manifest {include}")
    rows: list[tuple[str, str]] = []
    for path in key_files(root):
        rel = path.relative_to(root).as_posix()
        frontend = _is_frontend_input(rel)
        if include == "compute" and frontend:
            continue
        if include == "frontend" and not frontend:
            continue
        rows.append((rel, hashlib.sha256(path.read_bytes()).hexdigest()))
    return rows


def _widget_asset_filename(content: bytes) -> str:
    # Same content address as website/scripts/recipe_widget_esm.widget_asset_filename.
    return f"landmarks-{hashlib.sha256(content).hexdigest()}.mjs"


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


def read_compute_stamp(root: Path) -> str:
    key_path = bundle_dir(root) / "compute-key"
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
    compute_tmp = bundle / "compute-key.tmp"
    compute_tmp.write_text(compute_key(root) + "\n", encoding="utf-8")
    compute_tmp.replace(bundle / "compute-key")
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


def _output_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for rel in OUTPUTS:
        path = root / rel
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            files.extend(item for item in path.rglob("*") if item.is_file())
    return files


def _read_text(path: Path) -> str | None:
    if path.suffix.lower() in {".mjs", ".png", ".jpg", ".webp", ".gif", ".woff", ".woff2"}:
        return None
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


def _json_string_at(text: str, index: int) -> tuple[str, int]:
    value, end = json.JSONDecoder().raw_decode(text, index)
    if not isinstance(value, str):
        raise TypeError(f"expected a JSON string at {index}")
    return value, end


def _replace_widget_fields(
    text: str, css: str, old_md5: dict[str, str]
) -> tuple[str, int, int]:
    """Replace `_css` and ESM md5 fields. Leave every other byte alone."""
    out: list[str] = []
    index = 0
    css_found = 0
    hashes = 0
    length = len(text)
    while index < length:
        if text[index] != '"':
            out.append(text[index])
            index += 1
            continue
        try:
            key, after_key = _json_string_at(text, index)
        except (json.JSONDecodeError, ValueError, TypeError):
            out.append(text[index])
            index += 1
            continue
        cursor = after_key
        while cursor < length and text[cursor] in " \t\r\n":
            cursor += 1
        if cursor >= length or text[cursor] != ":":
            out.append(text[index:after_key])
            index = after_key
            continue
        cursor += 1
        while cursor < length and text[cursor] in " \t\r\n":
            cursor += 1
        if cursor >= length or text[cursor] != '"':
            out.append(text[index:after_key])
            index = after_key
            continue
        try:
            value, after_value = _json_string_at(text, cursor)
        except (json.JSONDecodeError, ValueError, TypeError):
            out.append(text[index:after_key])
            index = after_key
            continue
        replacement: str | None = None
        if key == "_css":
            css_found += 1
            if value != css:
                replacement = json.dumps(css, ensure_ascii=False)
        elif key == "hash" and value in old_md5:
            hashes += 1
            replacement = json.dumps(old_md5[value])
        if replacement is None:
            out.append(text[index:after_key])
            index = after_key
            continue
        out.append(text[index:cursor])
        out.append(replacement)
        index = after_value
    return "".join(out), css_found, hashes


def rebuild_widget(root: Path) -> None:
    """Build landmarks.mjs and widgets.css the same way export-recipes.sh does."""
    script = """
set -euo pipefail
cd frontend
if [[ "${MILUME_DEPS_READY_FRONTEND:-}" == "1" ]]; then
  echo "recipe-compute: frontend/node_modules cached, skipping npm ci"
elif [[ -f package-lock.json ]]; then
  npm ci --silent
else
  npm install --silent
fi
npm run -s build
"""
    _run(["bash", "-c", script], root)


def swap_hoisted_widget(root: Path, esm: bytes, css: str) -> None:
    """Point the packed export at a freshly built widget bundle.

    Marimo stores the ESM as a hoisted ``landmarks-<sha256>.mjs`` and the CSS
    as the ``_css`` string in prepared cell JSON. The ``@file`` lookup key
    stays put; only the href, the modulepreload, and the ESM md5 move.
    """
    if not esm or not css:
        raise SystemExit("recipe-compute: widget bundle is empty")
    asset_dir = root / "website/content/assets/recipe-widgets"
    asset_dir.mkdir(parents=True, exist_ok=True)
    new_name = _widget_asset_filename(esm)
    new_md5 = hashlib.md5(esm, usedforsecurity=False).hexdigest()
    old_md5: dict[str, str] = {}
    for path in asset_dir.glob("landmarks-*.mjs"):
        if path.name == new_name:
            continue
        old_md5[hashlib.md5(path.read_bytes(), usedforsecurity=False).hexdigest()] = new_md5
    dest = asset_dir / new_name
    if not dest.is_file() or dest.read_bytes() != esm:
        dest.write_bytes(esm)

    replaced_names = 0
    css_found = 0
    for path in _output_files(root):
        if path.suffix == ".mjs" and path.parent == asset_dir:
            continue
        text = _read_text(path)
        if text is None or (
            "landmarks-" not in text and "_css" not in text and "hash" not in text
        ):
            continue
        updated, name_hits = _LANDMARKS_ASSET.subn(
            lambda match: match.group(0) if match.group(0) == new_name else new_name,
            text,
        )
        replaced_names += name_hits
        if path.suffix == ".json":
            updated, found, _hashes = _replace_widget_fields(updated, css, old_md5)
            css_found += found
        if updated != text:
            path.write_text(updated, encoding="utf-8")

    if css_found == 0:
        raise SystemExit("recipe-compute: repack found no widget _css in the export")
    stale = [
        path.name
        for path in asset_dir.glob("landmarks-*.mjs")
        if path.name != new_name
    ]
    if stale and replaced_names == 0:
        raise SystemExit(
            "recipe-compute: repack found a widget bundle it did not relink: "
            + ", ".join(stale)
        )
    referenced = set()
    for path in _output_files(root):
        text = _read_text(path)
        if text:
            referenced.update(_LANDMARKS_ASSET.findall(text))
    if new_name not in referenced:
        raise SystemExit("recipe-compute: repack found no hoisted widget ESM")
    for path in asset_dir.glob("landmarks-*.mjs"):
        if path.name != new_name and path.name not in referenced:
            path.unlink()


def repack(root: Path) -> None:
    """Rebuild the widget onto a compute-cache hit. Does not re-run squidpy."""
    ensure_bundle_layout(root)
    stamped_compute = read_compute_stamp(root)
    current_compute = compute_key(root)
    if stamped_compute != current_compute:
        raise SystemExit(
            "recipe-compute: compute stamp "
            f"{stamped_compute or '(missing)'} does not match compute inputs {current_compute}"
        )
    if read_stamp(root) == cache_key(root):
        print(f"recipe-compute: compute cache already matches {cache_key(root)}", flush=True)
        return
    apply_tar(root)
    log_path = bundle_dir(root) / "export.log"
    if not log_path.is_file():
        raise SystemExit("recipe-compute: compute cache is missing export.log")
    log = log_path.read_text(encoding="utf-8")
    assert_prepared_log(log)
    started = time.perf_counter()
    rebuild_widget(root)
    bundled = root / "milume" / "static" / "bundled"
    esm_path = bundled / "landmarks.mjs"
    css_path = bundled / "widgets.css"
    if not esm_path.is_file() or not css_path.is_file():
        raise SystemExit(f"recipe-compute: widget build did not write {bundled}")
    swap_hoisted_widget(root, esm_path.read_bytes(), css_path.read_text(encoding="utf-8"))
    pack(root, cache_key(root), log, hash_manifest(root))
    print(
        f"recipe-compute: repacked widget in {time.perf_counter() - started:.0f}s "
        f"key {cache_key(root)}",
        flush=True,
    )


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
    if cmd == "compute-key":
        print(compute_key(root))
        return 0
    if cmd == "check":
        check(root)
        return 0
    if cmd == "compute":
        compute(root)
        return 0
    if cmd == "repack":
        repack(root)
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
        "usage: recipe_export_cache.py key|compute-key|check|compute|repack|assert-views|wait",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
