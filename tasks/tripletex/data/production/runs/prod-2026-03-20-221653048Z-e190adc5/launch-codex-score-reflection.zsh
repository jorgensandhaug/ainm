#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221653048Z-e190adc5/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d52-af1e-7c11-9e75-a97601596fe0'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-221653048Z-e190adc5"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221653048Z-e190adc5"
print "session id: 019d0d52-af1e-7c11-9e75-a97601596fe0"
exec zsh -i
