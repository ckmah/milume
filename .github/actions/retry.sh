#!/usr/bin/env bash
# Run a network-bound command with a hard per-attempt timeout and a few retries, so a
# stalled mirror (apt, npm registry, Playwright CDN) fails fast instead of eating the job.
# Usage: retry.sh <attempts> <timeout-seconds> <command...>
set -uo pipefail
attempts=$1
limit=$2
shift 2
rc=1
for ((i = 1; i <= attempts; i++)); do
  start=$SECONDS
  timeout --kill-after=15 "$limit" "$@"
  rc=$?
  echo "retry.sh: attempt ${i}/${attempts} of '$*' exited ${rc} after $((SECONDS - start))s"
  if [[ $rc -eq 0 ]]; then exit 0; fi
  if [[ $rc -eq 124 || $rc -eq 137 ]]; then echo "::warning::'$*' timed out after ${limit}s (attempt ${i}/${attempts})"; fi
  if ((i < attempts)); then sleep $((i * 5)); fi
done
exit "$rc"
