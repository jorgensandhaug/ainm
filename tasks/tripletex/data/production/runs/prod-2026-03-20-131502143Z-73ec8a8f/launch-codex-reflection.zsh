#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131502143Z-73ec8a8f/codex-reflection.prompt.txt'
SESSION_ID='019d0b62-9241-7dc2-8886-39a3c67af32c'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-131502143Z-73ec8a8f"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131502143Z-73ec8a8f"
print "session id: 019d0b62-9241-7dc2-8886-39a3c67af32c"
exec zsh -i
