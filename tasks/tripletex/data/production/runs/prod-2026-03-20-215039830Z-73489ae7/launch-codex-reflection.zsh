#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-215039830Z-73489ae7/codex-reflection.prompt.txt'
SESSION_ID='019d0d3a-a530-7c90-85f8-2b3f7fc86c6a'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-215039830Z-73489ae7"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-215039830Z-73489ae7"
print "session id: 019d0d3a-a530-7c90-85f8-2b3f7fc86c6a"
exec zsh -i
