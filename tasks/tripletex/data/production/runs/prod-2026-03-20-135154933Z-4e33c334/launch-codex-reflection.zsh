#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154933Z-4e33c334/codex-reflection.prompt.txt'
SESSION_ID='019d0b84-5562-7290-9481-c6e7df7a0f05'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-135154933Z-4e33c334"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154933Z-4e33c334"
print "session id: 019d0b84-5562-7290-9481-c6e7df7a0f05"
exec zsh -i
