#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819684Z-afc5fde0/codex-reflection.prompt.txt'
SESSION_ID='019d0c25-d8c7-76d2-af61-60a62130ed64'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-164819684Z-afc5fde0"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819684Z-afc5fde0"
print "session id: 019d0c25-d8c7-76d2-af61-60a62130ed64"
exec zsh -i
