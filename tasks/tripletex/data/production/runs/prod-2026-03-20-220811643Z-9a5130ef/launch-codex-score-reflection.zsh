#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220811643Z-9a5130ef/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d4a-bb50-7453-8121-7ac75b9e069f'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-220811643Z-9a5130ef"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220811643Z-9a5130ef"
print "session id: 019d0d4a-bb50-7453-8121-7ac75b9e069f"
exec zsh -i
