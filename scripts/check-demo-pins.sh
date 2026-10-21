#!/usr/bin/env bash
# Demo notebooks on main and in releases pin a released milume. Preview branches
# point the PEP 723 header at a branch wheel (#243); this keeps that out of both.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if hits=$(grep -HnE 'milume @|reinstall-package' demos/*.py); then
  echo "Demo notebooks must pin a released milume, not a preview build:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "demo pins ok"
