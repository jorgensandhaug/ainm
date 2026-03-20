#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160114982Z-9f31c41d/codex-reflection.prompt.txt'
SESSION_ID='019d0bfa-c5d9-77c1-9cae-2c8a78bde7a8'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-160114982Z-9f31c41d"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160114982Z-9f31c41d"
print "session id: 019d0bfa-c5d9-77c1-9cae-2c8a78bde7a8"
exec zsh -i
