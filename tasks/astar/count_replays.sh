#!/usr/bin/env bash
set -euo pipefail

replay_root="${1:-data/raw/replays}"

if [[ ! -d "$replay_root" ]]; then
  echo "missing dir: $replay_root" >&2
  exit 1
fi

find "$replay_root" -type f -path '*/seed_index=*/*.json' -print | wc -l
