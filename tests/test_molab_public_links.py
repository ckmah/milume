"""Public molab demo links track main, not pinned commit SHAs."""

import importlib.util
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

_MOLAB_URL = re.compile(r"https://molab\.marimo\.io/[^\s\"')>\]]+")
_SHA_BLOB = re.compile(r"/blob/[0-9a-f]{40}/", re.IGNORECASE)


def _canonical_landmarks_molab_url() -> str:
    path = ROOT / "demos" / "molab_header.py"
    spec = importlib.util.spec_from_file_location("molab_header", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod.MOLAB_LANDMARKS_DEMO_URL


def test_rg_finds_no_pinned_sha_molab_urls() -> None:
    proc = subprocess.run(
        [
            "rg",
            "-n",
            r"molab\.marimo\.io.*blob/[0-9a-f]{40}",
            ".",
            "--glob",
            "!uv.lock",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 1, proc.stdout or proc.stderr


def test_documented_molab_links_match_canonical_main_url() -> None:
    canonical = _canonical_landmarks_molab_url()
    assert "/blob/main/" in canonical
    paths = [
        ROOT / "README.md",
        ROOT / "website" / "landing" / "index.md",
        ROOT / "website" / "landing" / "index.html",
        ROOT / "website" / "content" / "install.md",
    ]
    for path in paths:
        text = path.read_text(encoding="utf-8")
        urls = _MOLAB_URL.findall(text)
        assert canonical in urls, f"{path} missing canonical molab link"
        for url in urls:
            assert not _SHA_BLOB.search(url), url
            if "github/ckmah/milume/" in url:
                assert url == canonical, f"{path}: {url}"
