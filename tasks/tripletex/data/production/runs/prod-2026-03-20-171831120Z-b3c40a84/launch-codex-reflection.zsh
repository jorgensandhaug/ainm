#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-171831120Z-b3c40a84/codex-reflection.prompt.txt'
SESSION_ID='019d0c41-7c68-7440-b0ad-64cc04c3c370'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-171831120Z-b3c40a84"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-171831120Z-b3c40a84"
print "session id: 019d0c41-7c68-7440-b0ad-64cc04c3c370"
exec zsh -i
