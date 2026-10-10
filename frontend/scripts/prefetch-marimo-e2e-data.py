"""Warm the Hugging Face cache for demos/landmarks.py (marimo volume e2e)."""

from __future__ import annotations

from huggingface_hub import snapshot_download


def main() -> None:
    snapshot_download(
        "Stellaromics/demo",
        repo_type="dataset",
        allow_patterns="small/*",
        ignore_patterns="*cell_assigned_gene*",
    )


if __name__ == "__main__":
    main()
