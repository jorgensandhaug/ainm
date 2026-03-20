#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-215911709Z-f9b7ed7e/codex-prompt.txt'

codex --yolo --no-alt-screen "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: prod-2026-03-19-215911709Z-f9b7ed7e"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-215911709Z-f9b7ed7e"
print "request file: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-215911709Z-f9b7ed7e/request.json"
exec zsh -i
