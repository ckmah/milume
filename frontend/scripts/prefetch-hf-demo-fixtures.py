"""Download Stellaromics/demo slices for agent harness work (no pyxa SpatialData build).

Use before `npm run dev:fixture:volume-xsmall` / `volume-small` so export only writes JSON.
Agents must not run `build_colon_a2_store.py` on cloud VMs (OOM); use colon harness subsamples instead.
"""

from __future__ import annotations

import argparse

from huggingface_hub import snapshot_download

REPO = "Stellaromics/demo"
IGNORE = "*cell_assigned_gene*"


def prefetch(profile: str) -> None:
    snapshot_download(
        REPO,
        repo_type="dataset",
        allow_patterns=f"{profile}/*",
        ignore_patterns=IGNORE,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--profile",
        choices=("xsmall", "small"),
        action="append",
        dest="profiles",
        help="HF tree to warm (default: both xsmall and small)",
    )
    args = parser.parse_args()
    for profile in args.profiles or ("xsmall", "small"):
        prefetch(profile)
        print(f"prefetched {REPO}/{profile}/")


if __name__ == "__main__":
    main()
