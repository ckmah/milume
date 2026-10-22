#!/usr/bin/env bash
# `playwright install-deps chromium` with a per-attempt timeout. On failure it kills the
# orphaned root apt-get (timeout can't signal it through sudo, and it keeps the dpkg lock),
# repairs dpkg, and points apt at archive.ubuntu.com for the next attempt, because the
# stalls we've seen are the Azure mirror trickling .debs at ~35 kB/s.
# Usage: install-deps.sh [attempts] [timeout-seconds] [first-attempt-timeout-seconds]
set -uo pipefail
attempts=${1:-3}
limit=${2:-180}
first=${3:-$limit}
rc=1
for ((i = 1; i <= attempts; i++)); do
  t=$limit
  if ((i == 1)); then t=$first; fi
  start=$SECONDS
  timeout --kill-after=10 "$t" npx playwright install-deps chromium
  rc=$?
  echo "install-deps: attempt ${i}/${attempts} exited ${rc} after $((SECONDS - start))s (limit ${t}s)"
  if [[ $rc -eq 0 ]]; then exit 0; fi
  echo "::warning::playwright install-deps attempt ${i}/${attempts} failed (exit ${rc})"
  if ((i == attempts)); then break; fi
  sudo pkill -KILL -x apt-get || true
  sudo pkill -KILL -f '/usr/lib/apt/methods/' || true
  sleep 2
  sudo dpkg --configure -a || true
  files=$(sudo grep -rl 'azure.archive.ubuntu.com' /etc/apt/sources.list /etc/apt/sources.list.d /etc/apt/apt-mirrors.txt 2>/dev/null || true)
  if [[ -n $files ]]; then
    echo "install-deps: switching apt mirror to archive.ubuntu.com in: ${files//$'\n'/ }"
    # shellcheck disable=SC2086
    sudo sed -i 's#azure\.archive\.ubuntu\.com#archive.ubuntu.com#g' $files
  fi
  sleep $((i * 5))
done
exit "$rc"
