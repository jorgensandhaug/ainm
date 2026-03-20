#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221651369Z-1afff2f2/codex-reflection.prompt.txt'
SESSION_ID='019d0d52-a031-7741-8b4d-60ff248e65dc'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-221651369Z-1afff2f2"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221651369Z-1afff2f2"
print "session id: 019d0d52-a031-7741-8b4d-60ff248e65dc"
exec zsh -i
