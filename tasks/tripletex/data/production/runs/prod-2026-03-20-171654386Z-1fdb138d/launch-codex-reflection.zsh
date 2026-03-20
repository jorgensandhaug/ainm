#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-171654386Z-1fdb138d/codex-reflection.prompt.txt'
SESSION_ID='019d0c40-0553-7450-8b88-526f53c95d11'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-171654386Z-1fdb138d"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-171654386Z-1fdb138d"
print "session id: 019d0c40-0553-7450-8b88-526f53c95d11"
exec zsh -i
