#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223638732Z-2498866c/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d64-bf58-79e0-9fa8-4a5c83798ce4'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-223638732Z-2498866c"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223638732Z-2498866c"
print "session id: 019d0d64-bf58-79e0-9fa8-4a5c83798ce4"
exec zsh -i
