#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-221813444Z-3b3d3442/codex-prompt.txt'

codex --yolo --no-alt-screen "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: test-2026-03-19-221813444Z-3b3d3442"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-221813444Z-3b3d3442"
print "request file: /home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-221813444Z-3b3d3442/request.json"
exec zsh -i
