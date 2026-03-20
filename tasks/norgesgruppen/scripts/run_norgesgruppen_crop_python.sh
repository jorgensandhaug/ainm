#!/usr/bin/env bash
set -euo pipefail

VENV_PATH=".venv-crop"

if [[ ${1:-} == "--venv" ]]; then
  VENV_PATH="$2"
  shift 2
fi

if [[ $# -eq 0 ]]; then
  echo "usage: $0 [--venv PATH] <python-args...>" >&2
  exit 2
fi

LIBSTDCPP_PATH="$(find /nix/store -path '*/share/nix-ld/lib/libstdc++.so.6' -print -quit 2>/dev/null || true)"
if [[ -z "$LIBSTDCPP_PATH" ]]; then
  LIBSTDCPP_PATH="$(find /nix/store -path '*/lib/libstdc++.so.6' -print -quit 2>/dev/null || true)"
fi

if [[ -n "$LIBSTDCPP_PATH" ]]; then
  LIB_DIR="$(dirname "$LIBSTDCPP_PATH")"
  export LD_LIBRARY_PATH="$LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

exec "$VENV_PATH/bin/python" "$@"
