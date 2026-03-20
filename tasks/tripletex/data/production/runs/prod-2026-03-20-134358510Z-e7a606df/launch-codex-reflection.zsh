#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-134358510Z-e7a606df/codex-reflection.prompt.txt'
SESSION_ID='019d0b7d-1066-7903-83a8-6e251f0a29e5'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-134358510Z-e7a606df"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-134358510Z-e7a606df"
print "session id: 019d0b7d-1066-7903-83a8-6e251f0a29e5"
exec zsh -i
