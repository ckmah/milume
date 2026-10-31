#!/usr/bin/env python3
"""Export gzip and raw CSC harness fixtures for ileum all-genes browser timing (#408)."""

from __future__ import annotations

import argparse
import base64
import gzip
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget  # noqa: E402

DEV = ROOT / "frontend" / "dev"
_pyxa_spec = importlib.util.spec_from_file_location(
    "export_pyxa_harness_fixture",
    DEV / "export-pyxa-harness-fixture.py",
)
_pyxa = importlib.util.module_from_spec(_pyxa_spec)
assert _pyxa_spec.loader is not None
_pyxa_spec.loader.exec_module(_pyxa)
FIXTURE_KEYS = _pyxa.FIXTURE_KEYS
_apply_harness_chrome = _pyxa._apply_harness_chrome


def _payload(widget: LandmarksWidget, *, raw_csc: bool) -> dict[str, object]:
    out = {key: getattr(widget, key) for key in FIXTURE_KEYS}
    if not raw_csc or widget.gene_csc_codec != "gzip":
        return out

    def decode_trait(b64: str) -> bytes:
        return gzip.decompress(base64.b64decode(b64))

    out["gene_csc_indptr"] = base64.b64encode(decode_trait(widget.gene_csc_indptr)).decode("ascii")
    out["gene_csc_indices"] = base64.b64encode(decode_trait(widget.gene_csc_indices)).decode("ascii")
    out["gene_csc_data"] = base64.b64encode(decode_trait(widget.gene_csc_data)).decode("ascii")
    out["gene_csc_codec"] = ""
    return out


def _build_widget(max_cells: int) -> LandmarksWidget:
    from demos.loaders.demo_tiers import load_2d_ileum_adata

    adata = load_2d_ileum_adata()
    if max_cells and adata.n_obs > max_cells:
        import scanpy as sc

        sc.pp.subsample(adata, n_obs=max_cells, random_state=0)
    color_key = "cell_type" if "cell_type" in adata.obs.columns else None
    return LandmarksWidget(
        adata,
        spatial_key="spatial",
        color=color_key,
        genes=list(adata.var_names),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max-cells",
        type=int,
        default=8000,
        help="Subsample ileum cells (default: 8000 for harness-sized fixtures)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEV / ".ileum-gene-fixtures-cache",
        help="Directory for JSON fixtures (not committed)",
    )
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    widget = _build_widget(args.max_cells)
    _apply_harness_chrome(widget, _payload(widget, raw_csc=False))
    for name, raw in (("ileum-all-genes-gzip-fixture.json", False), ("ileum-all-genes-raw-fixture.json", True)):
        body = _payload(widget, raw_csc=raw)
        dest = args.output_dir / name
        dest.write_text(json.dumps(body) + "\n")
        print(f"wrote {dest} ({dest.stat().st_size:,} B)")


if __name__ == "__main__":
    main()
