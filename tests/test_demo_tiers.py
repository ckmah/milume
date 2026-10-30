"""Tests for demos/demo_tiers.py (issue #343 tier loader)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from demos.loaders import demo_tiers


def test_load_tiny_synthetic_adata():
    adata = demo_tiers.load_tiny_synthetic_adata(n=50, seed=1)
    assert adata.n_obs == 50
    assert "spatial" in adata.obsm
    assert "cell_type" in adata.obs.columns


def test_load_2d_ileum_adata_from_repo():
    adata = demo_tiers.load_2d_ileum_adata()
    assert adata.n_obs > 30_000
    assert adata.n_vars == 1815
    assert "cell_type" in adata.obs.columns
    assert adata.obsm["spatial"].shape[1] == 2


def test_ileum_h5ad_path_prefers_repo_file(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    repo_copy = tmp_path / "demos" / "data" / "ileum.h5ad"
    repo_copy.parent.mkdir(parents=True)
    repo_copy.write_bytes(b"fake")
    monkeypatch.setattr(demo_tiers, "_ILEUM_H5AD", tmp_path / "other" / "ileum.h5ad")
    assert demo_tiers.ileum_h5ad_path().resolve() == repo_copy.resolve()


def test_ileum_h5ad_path_downloads_when_repo_missing(tmp_path, monkeypatch):
    missing = tmp_path / "repo" / "ileum.h5ad"
    monkeypatch.setattr(demo_tiers, "_ILEUM_H5AD", missing)
    cache = tmp_path / "cache" / "ileum_merfish_xu2026.h5ad"
    cache.parent.mkdir(parents=True)
    cache.write_bytes(b"from-fetch")

    def fake_fetch(name, *, force_download=False):
        assert name == "ileum_merfish_xu2026"
        assert force_download is True
        return cache

    monkeypatch.setattr("milume.datasets.fetch", fake_fetch)
    path = demo_tiers.ileum_h5ad_path(force_remote=True)
    assert path == cache


def test_load_full_colon_sdata_missing_store(tmp_path, monkeypatch):
    store = tmp_path / "nope.sdata.zarr"
    monkeypatch.setattr(demo_tiers, "_DEFAULT_COLON_STORE", store)
    monkeypatch.delenv("COLON_A2_STORE", raising=False)
    with pytest.raises(FileNotFoundError, match="build_colon_a2_store"):
        demo_tiers.load_full_colon_sdata()


def test_load_full_colon_sdata_reads_env_store(tmp_path, monkeypatch):
    store = tmp_path / "colon.sdata.zarr"
    store.mkdir()
    monkeypatch.setenv("COLON_A2_STORE", str(store))
    fake_sd = MagicMock()
    monkeypatch.setattr("spatialdata.read_zarr", lambda p: fake_sd)
    out = demo_tiers.load_full_colon_sdata()
    assert out is fake_sd


def test_load_3d_small_pyxa_mocked(monkeypatch):
    pytest.importorskip("spatialdata_io")
    fake_dir = Path("/fake/small")

    monkeypatch.setattr(demo_tiers, "_snapshot_pyxa_dir", lambda profile: fake_dir)
    calls = []

    def fake_pyxa(path, **kwargs):
        calls.append((path, kwargs))
        import spatialdata as sd

        return sd.SpatialData()

    monkeypatch.setattr(
        "spatialdata_io.experimental.pyxa",
        fake_pyxa,
    )
    demo_tiers.load_3d_small_pyxa(labels=True)
    assert calls == [(fake_dir, {"cell_assigned_gene": False, "labels": True})]
