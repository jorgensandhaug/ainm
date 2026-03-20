#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-153520312Z-5a2e316c/codex-reflection.prompt.txt'
SESSION_ID='019d0be3-06fc-7c42-8b8a-004180ac3bb9'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-153520312Z-5a2e316c"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-153520312Z-5a2e316c"
print "session id: 019d0be3-06fc-7c42-8b8a-004180ac3bb9"
exec zsh -i
