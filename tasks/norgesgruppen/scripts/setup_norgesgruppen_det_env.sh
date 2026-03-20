#!/usr/bin/env bash
set -euo pipefail

VENV_PATH=".venv-det"
CUDA_INDEX_URL=""
PYTHON_VERSION="3.11"

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
    --python)
      PYTHON_VERSION="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      echo "usage: $0 [--venv PATH] [--cuda-index-url URL] [--python VERSION]" >&2
      exit 2
      ;;
  esac
done

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found" >&2
  exit 1
fi

uv venv "$VENV_PATH" --clear --python "$PYTHON_VERSION"

if [[ -n "$CUDA_INDEX_URL" ]]; then
  uv pip install \
    --python "$VENV_PATH/bin/python" \
    --index-url "$CUDA_INDEX_URL" \
    torch==2.6.0 \
    torchvision==0.21.0
else
  uv pip install \
    --python "$VENV_PATH/bin/python" \
    torch==2.6.0 \
    torchvision==0.21.0
fi

uv pip install \
  --python "$VENV_PATH/bin/python" \
  ultralytics==8.1.0 \
  pillow==10.2.0 \
  numpy==1.26.4

uv pip uninstall --python "$VENV_PATH/bin/python" opencv-python || true
uv pip install \
  --python "$VENV_PATH/bin/python" \
  opencv-python-headless==4.9.0.80

echo "ready: $VENV_PATH"
