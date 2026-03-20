#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223526134Z-ab23f4db/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d63-a23c-7ea1-986d-ba7136be2bd8'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-223526134Z-ab23f4db"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223526134Z-ab23f4db"
print "session id: 019d0d63-a23c-7ea1-986d-ba7136be2bd8"
exec zsh -i
