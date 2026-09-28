from pathlib import Path

import pytest

BUNDLED = Path(__file__).resolve().parents[1] / "spatial_rx" / "static" / "bundled"


@pytest.mark.parametrize("bundle", ["gallery.mjs", "landmarks.mjs", "volume-cube.mjs"])
def test_bundle_does_not_reference_process_env(bundle):
    """Browser ESM has no Node `process`; a bare `process.env` throws."""
    assert "process.env" not in (BUNDLED / bundle).read_text(encoding="utf-8")
