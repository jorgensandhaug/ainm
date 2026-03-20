#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-162453083Z-f4543b2f/codex-reflection.prompt.txt'
SESSION_ID='019d0c10-61bf-7e12-b9c0-23b94c03ff87'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-162453083Z-f4543b2f"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-162453083Z-f4543b2f"
print "session id: 019d0c10-61bf-7e12-b9c0-23b94c03ff87"
exec zsh -i
