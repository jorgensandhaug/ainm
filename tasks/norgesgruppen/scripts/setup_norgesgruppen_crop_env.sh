#!/usr/bin/env bash
set -euo pipefail

VENV_PATH=".venv-crop"
CUDA_INDEX_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --venv)
      VENV_PATH="$2"
      shift 2
      ;;
    --cuda-index-url)
      CUDA_INDEX_URL="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      echo "usage: $0 [--venv PATH] [--cuda-index-url URL]" >&2
      exit 2
      ;;
  esac
done

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found" >&2
  exit 1
fi

uv venv "$VENV_PATH" --python 3.12

uv pip install \
  --python "$VENV_PATH/bin/python" \
  pillow \
  numpy \
  safetensors \
  timm \
  open-clip-torch \
  "transformers>=4.56.0"

if [[ -n "$CUDA_INDEX_URL" ]]; then
  uv pip install \
    --python "$VENV_PATH/bin/python" \
    --index-url "$CUDA_INDEX_URL" \
    torch \
    torchvision
else
  uv pip install \
    --python "$VENV_PATH/bin/python" \
    torch \
    torchvision
fi

echo "ready: $VENV_PATH"
