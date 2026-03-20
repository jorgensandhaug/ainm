#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-141139299Z-7ed19654/codex-reflection.prompt.txt'
SESSION_ID='019d0b96-67d5-75f3-9b00-b8c3e275cbb5'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-141139299Z-7ed19654"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-141139299Z-7ed19654"
print "session id: 019d0b96-67d5-75f3-9b00-b8c3e275cbb5"
exec zsh -i
