#!/usr/bin/env python3
"""Regression: harness #394 gene-blend patches and expressing fractions."""

from __future__ import annotations

import base64
import json
from pathlib import Path

import numpy as np
import pytest

DEV = Path(__file__).resolve().parents[1] / "frontend" / "dev"
PATCH_PATH = DEV / "harness-visual-394" / "gene-blend.json"
GOLDEN_PATH = DEV / "harness-visual-394" / "gene-blend-golden.json"


def _n_obs(points_b64: str) -> int:
    pad = 2 if points_b64.endswith("==") else 1 if points_b64.endswith("=") else 0
    return max(0, (len(points_b64) * 3 // 4 - pad) // 16)


def _dense_column(indptr, indices, data, j: int, n: int) -> np.ndarray:
    col = np.zeros(n, dtype=np.float32)
    a, b = int(indptr[j]), int(indptr[j + 1])
    for p in range(a, b):
        row = int(indices[p])
        if 0 <= row < n:
            col[row] = data[p]
    return col


def _expressing_pct(col: np.ndarray) -> int:
    if col.size == 0:
        return 0
    return int(round(float(np.count_nonzero(col > 0)) / float(col.size) * 100))


def _side_stats(side: dict) -> dict:
    n = _n_obs(str(side["points_data"]))
    indptr_b = side.get("_gene_csc_indptr") or side.get("gene_csc_indptr") or ""
    indices_b = side.get("_gene_csc_indices") or side.get("gene_csc_indices") or ""
    data_b = side.get("_gene_csc_data") or side.get("gene_csc_data") or ""
    indptr = np.frombuffer(base64.b64decode(indptr_b), dtype=np.int32)
    indices = np.frombuffer(base64.b64decode(indices_b), dtype=np.int32)
    data = np.frombuffer(base64.b64decode(data_b), dtype=np.float32)
    genes = ["Abtb3", "Adamts2"]
    cols = [_dense_column(indptr, indices, data, j, n) for j in range(len(genes))]
    return {
        "n_obs": n,
        "expressing_pct": {genes[j]: _expressing_pct(cols[j]) for j in range(len(genes))},
        "color_digest": hash(tuple(cols[0].tobytes() + cols[1].tobytes())),
    }


def test_gene_blend_legacy_and_color_api_match_golden():
    doc = json.loads(PATCH_PATH.read_text())
    golden = json.loads(GOLDEN_PATH.read_text())
    legacy = _side_stats(doc["legacy"])
    color_api = _side_stats(doc["colorApi"])
    assert legacy == color_api
    assert legacy["expressing_pct"] == golden["expressing_pct"]
    assert legacy["n_obs"] == golden["n_obs"]
    assert doc["legacy"].get("gene_names")


def test_gene_blend_expressing_fractions_high():
    doc = json.loads(PATCH_PATH.read_text())
    stats = _side_stats(doc["colorApi"])
    for name, pct in stats["expressing_pct"].items():
        assert pct >= 90, f"{name} expressing {pct}% (expected ~all cells from rng 394 pack)"
