"""Tests for ``milume.datasets`` (issue #380)."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import pytest

import milume.datasets as mds
from milume.datasets._fetch import DatasetChecksumError, cache_dir, fetch_file
from milume.datasets._registry import _ILEUM_SHA256

ROOT = Path(__file__).resolve().parents[1]
ILEUM_REPO = ROOT / "demos" / "data" / "ileum.h5ad"


def test_list_datasets_includes_ileum():
    assert mds.list_datasets() == ["ileum_merfish_xu2026"]


def test_info_matches_registry_and_docs():
    meta = mds.info("ileum_merfish_xu2026")
    assert meta.name == "ileum_merfish_xu2026"
    assert meta.size_bytes == 5_014_135
    assert meta.n_obs == 30_332
    assert meta.n_vars == 1_815
    assert meta.license == "CC0-1.0"
    assert meta.sha256 == _ILEUM_SHA256
    assert "main" not in meta.url
    assert meta.url.endswith("/demos/data/ileum.h5ad")


def test_ileum_merfish_xu2026_from_repo_path():
    adata = mds.ileum_merfish_xu2026(path=ILEUM_REPO)
    assert adata.shape == (30_332, 1_815)
    assert "spatial" in adata.obsm


def test_fetch_uses_milume_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("MILUME_DATA_DIR", str(tmp_path))
    dest = tmp_path / "ileum_merfish_xu2026.h5ad"
    dest.write_bytes(ILEUM_REPO.read_bytes())
    got = mds.fetch("ileum_merfish_xu2026")
    assert got.resolve() == dest.resolve()


def test_cache_dir_prefers_milume_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("MILUME_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("XDG_CACHE_HOME", raising=False)
    assert cache_dir() == tmp_path / "data"


def test_cache_dir_xdg_fallback(tmp_path, monkeypatch):
    monkeypatch.delenv("MILUME_DATA_DIR", raising=False)
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "xdg"))
    assert cache_dir() == tmp_path / "xdg" / "milume"


def test_checksum_mismatch_removes_part_and_raises(tmp_path, monkeypatch):
    dest = tmp_path / "bad.h5ad"

    def fake_urlopen(url):
        class Resp:
            _done = False

            def read(self, n=-1):
                if self._done:
                    return b""
                self._done = True
                return b"not-the-file"

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        return Resp()

    monkeypatch.setattr("milume.datasets._fetch.urllib.request.urlopen", fake_urlopen)
    with pytest.raises(DatasetChecksumError, match="checksum mismatch"):
        fetch_file("ileum_merfish_xu2026", path=dest, force_download=True)
    assert not dest.is_file()
    assert not dest.with_suffix(dest.suffix + ".part").is_file()


def test_force_download_overwrites(tmp_path, monkeypatch):
    dest = tmp_path / "ileum.h5ad"
    dest.write_bytes(b"stale")
    good = ILEUM_REPO.read_bytes()

    calls = {"n": 0}

    def fake_urlopen(url):
        calls["n"] += 1

        class Resp:
            _sent = False

            def read(self, n=-1):
                if self._sent:
                    return b""
                self._sent = True
                return good

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        return Resp()

    monkeypatch.setattr("milume.datasets._fetch.urllib.request.urlopen", fake_urlopen)
    out = fetch_file("ileum_merfish_xu2026", path=dest, force_download=True)
    assert out == dest
    assert hashlib.sha256(dest.read_bytes()).hexdigest() == _ILEUM_SHA256
    assert calls["n"] == 1


@pytest.mark.skipif(
    not os.environ.get("MILUME_DATASET_NETWORK"),
    reason="set MILUME_DATASET_NETWORK=1 to verify the pinned download URL",
)
def test_pinned_ileum_url_matches_checksum():
    meta = mds.info("ileum_merfish_xu2026")
    path = mds.fetch("ileum_merfish_xu2026", force_download=True)
    assert path.stat().st_size == meta.size_bytes
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == meta.sha256
