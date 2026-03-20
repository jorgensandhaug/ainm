#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-220821870Z-fc2d6b0b/codex-prompt.txt'

codex --yolo --no-alt-screen "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: test-2026-03-19-220821870Z-fc2d6b0b"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-220821870Z-fc2d6b0b"
print "request file: /home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-220821870Z-fc2d6b0b/request.json"
exec zsh -i
