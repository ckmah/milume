"""Public molab demo links track main, not pinned commit SHAs."""

import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

_MOLAB_URL = re.compile(r"https://molab\.marimo\.io/[^\s\"')>\]]+")
_SHA_BLOB = re.compile(r"/blob/[0-9a-f]{40}/", re.IGNORECASE)

_SCAN_PATHS = [
    ROOT / "README.md",
    ROOT / "website" / "landing" / "index.md",
    ROOT / "website" / "landing" / "index.html",
    ROOT / "website" / "content" / "install.md",
]


def _canonical_landmarks_molab_url() -> str:
    path = ROOT / "demos" / "molab_header.py"
    spec = importlib.util.spec_from_file_location("molab_header", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod.MOLAB_LANDMARKS_DEMO_URL


def _repo_text_paths() -> list[Path]:
    paths = list(_SCAN_PATHS)
    paths.extend((ROOT / "website" / "content").rglob("*.md"))
    paths.extend((ROOT / "demos").glob("*.py"))
    return sorted({p for p in paths if p.is_file() and p.name != "molab_header.py"})


def test_no_pinned_sha_molab_urls_in_public_sources() -> None:
    for path in _repo_text_paths():
        for url in _MOLAB_URL.findall(path.read_text(encoding="utf-8")):
            assert not _SHA_BLOB.search(url), f"{path}: {url}"


def test_documented_molab_links_match_canonical_main_url() -> None:
    canonical = _canonical_landmarks_molab_url()
    assert "/blob/main/" in canonical
    for path in _SCAN_PATHS:
        text = path.read_text(encoding="utf-8")
        urls = _MOLAB_URL.findall(text)
        assert canonical in urls, f"{path} missing canonical molab link"
        for url in urls:
            assert not _SHA_BLOB.search(url), url
            if "github/ckmah/milume/" in url:
                assert url == canonical, f"{path}: {url}"
