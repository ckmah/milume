#!/usr/bin/env bash
# Py3.14 install smoke: scratch project with matplotlib + milume wheel must lock s3fs
# at or above the declared floor (#350). Negative proof: without the floor, lowest
# resolution must fail.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
PREFIX="check-py314-milume-resolve"

cleanup() {
  if [[ -n "${wheel_out:-}" && -d "${wheel_out:-}" ]]; then rm -rf "$wheel_out"; fi
  if [[ -n "${scratch:-}" && -d "${scratch:-}" ]]; then rm -rf "$scratch"; fi
  if [[ -n "${neg_repo:-}" && -d "${neg_repo:-}" ]]; then rm -rf "$neg_repo"; fi
  if [[ -n "${neg_wheel_out:-}" && -d "${neg_wheel_out:-}" ]]; then rm -rf "$neg_wheel_out"; fi
  if [[ -n "${neg_scratch:-}" && -d "${neg_scratch:-}" ]]; then rm -rf "$neg_scratch"; fi
}
trap cleanup EXIT

if [[ -n "${S3FS_FLOOR:-}" ]]; then
  floor="$S3FS_FLOOR"
else
  floor="$(grep -E '^\s*"s3fs>=' pyproject.toml | sed -E 's/.*s3fs>=([^"\\]+).*/\1/' | head -1)"
fi
if [[ -z "$floor" ]]; then
  echo "$PREFIX: FAIL could not read s3fs floor from pyproject.toml (set S3FS_FLOOR)" >&2
  exit 1
fi

wheel_out="$(mktemp -d)"
uv build --wheel --out-dir "$wheel_out" >&2
wheel="$(ls "$wheel_out"/*.whl)"
wheel_base="$(basename "$wheel")"

metadata="$(unzip -p "$wheel" '*.dist-info/METADATA' 2>/dev/null || true)"
if ! grep -qE '^Requires-Dist: s3fs>=' <<<"$metadata"; then
  echo "$PREFIX: FAIL $(basename "$wheel") METADATA missing Requires-Dist: s3fs>=..." >&2
  exit 1
fi
echo "$PREFIX: wheel METADATA declares s3fs floor (Requires-Dist: s3fs>=...)"

write_scratch_pyproject() {
  local dest="$1"
  local whl="$2"
  cat >"$dest/pyproject.toml" <<EOF
[project]
name = "scratch-py314-milume"
version = "0"
requires-python = ">=3.14"
dependencies = [
    "matplotlib>=3.11.2",
    "milume",
]

[tool.uv.sources]
milume = { path = "$whl" }
EOF
}

lock_s3fs_version() {
  local lockfile="$1"
  python3 - "$lockfile" <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text()
m = re.search(r'name = "s3fs"\nversion = "([^"]+)"', text)
if not m:
    sys.exit("missing s3fs package entry in uv.lock")
print(m.group(1))
PY
}

version_ge() {
  local got="$1" min="$2"
  [[ "$(printf '%s\n' "$got" "$min" | sort -V | tail -1)" == "$got" ]]
}

assert_s3fs_at_floor() {
  local lockfile="$1"
  local got
  got="$(lock_s3fs_version "$lockfile")"
  if ! version_ge "$got" "$floor"; then
    echo "$PREFIX: FAIL s3fs $got < floor $floor in $(basename "$lockfile")" >&2
    exit 1
  fi
  printf '%s' "$got"
}

run_positive_lock() {
  local whl="$1"
  scratch="$(mktemp -d)"
  write_scratch_pyproject "$scratch" "$whl"
  (
    cd "$scratch"
    uv lock --python 3.14 >&2
    resolved="$(assert_s3fs_at_floor uv.lock)"
    echo "$PREFIX: uv lock ok for matplotlib + milume on 3.14 (s3fs $resolved >= $floor)"
  )
  rm -rf "$scratch"
  scratch=""
}

run_negative_proof() {
  local whl="$1"
  neg_repo="$(mktemp -d)"
  cp -a "$ROOT/." "$neg_repo/"
  rm -rf "$neg_repo/.git"
  sed -i '/s3fs>=/d' "$neg_repo/pyproject.toml"
  if grep -q 's3fs>=' "$neg_repo/pyproject.toml"; then
    echo "$PREFIX: NEGATIVE PROOF: FAIL could not strip s3fs>= from copied pyproject.toml" >&2
    exit 1
  fi
  neg_wheel_out="$(mktemp -d)"
  (cd "$neg_repo" && uv build --wheel --out-dir "$neg_wheel_out" >&2)
  neg_wheel="$(ls "$neg_wheel_out"/*.whl)"
  neg_scratch="$(mktemp -d)"
  write_scratch_pyproject "$neg_scratch" "$neg_wheel"
  if (
    cd "$neg_scratch"
    UV_RESOLUTION=lowest uv lock --python 3.14 >&2
  ); then
    echo "$PREFIX: NEGATIVE PROOF: FAIL UV_RESOLUTION=lowest uv lock succeeded without s3fs floor (expected failure)" >&2
    exit 1
  fi
  echo "$PREFIX: NEGATIVE PROOF: PASS lowest resolution failed without s3fs floor"
  rm -rf "$neg_scratch" "$neg_wheel_out" "$neg_repo"
  neg_scratch=""
  neg_wheel_out=""
  neg_repo=""
}

run_positive_lock "$wheel"
run_negative_proof "$wheel"

echo "$PREFIX: PASS (floor s3fs>=$floor, wheel $wheel_base)"
