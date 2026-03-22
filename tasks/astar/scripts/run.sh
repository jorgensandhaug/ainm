#!/bin/bash
# Environment setup for running agent3 scripts
export PATH="/home/jorge/.local/bin:$PATH"
export LD_LIBRARY_PATH="/nix/store/ihpdbhy4rfxaixiamyb588zfc3vj19al-gcc-15.2.0-lib/lib:/nix/store/xdxxfabbd8w0dadijsd8rkgvnhpn3rkf-zlib-1.3.1/lib"
cd /home/jorge/agent3/tasks/astar

exec uv run python3 "$@"
