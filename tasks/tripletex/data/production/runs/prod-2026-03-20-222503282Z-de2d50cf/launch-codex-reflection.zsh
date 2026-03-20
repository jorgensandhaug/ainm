#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222503282Z-de2d50cf/codex-reflection.prompt.txt'
SESSION_ID='019d0d5a-21ba-7f10-baad-a1f059762ce1'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-222503282Z-de2d50cf"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222503282Z-de2d50cf"
print "session id: 019d0d5a-21ba-7f10-baad-a1f059762ce1"
exec zsh -i
