#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183453938Z-235fd3cc/codex-reflection.prompt.txt'
SESSION_ID='019d0c87-6d1f-7322-8dbc-eb3f66f9fd74'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-183453938Z-235fd3cc"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183453938Z-235fd3cc"
print "session id: 019d0c87-6d1f-7322-8dbc-eb3f66f9fd74"
exec zsh -i
