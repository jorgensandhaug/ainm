#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-212635480Z-9c16fc5f/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d24-9acf-7320-9895-5e9aee2592a9'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-212635480Z-9c16fc5f"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-212635480Z-9c16fc5f"
print "session id: 019d0d24-9acf-7320-9895-5e9aee2592a9"
exec zsh -i
