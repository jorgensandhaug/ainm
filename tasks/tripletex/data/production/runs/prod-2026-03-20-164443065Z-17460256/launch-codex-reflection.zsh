#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/codex-reflection.prompt.txt'
SESSION_ID='019d0c22-8a37-7311-9b9a-3485e0349fd9'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-164443065Z-17460256"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256"
print "session id: 019d0c22-8a37-7311-9b9a-3485e0349fd9"
exec zsh -i
