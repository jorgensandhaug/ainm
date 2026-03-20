#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190747583Z-f812be55/codex-reflection.prompt.txt'
SESSION_ID='019d0ca5-87a0-73d3-a053-5dc7052efec9'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-190747583Z-f812be55"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190747583Z-f812be55"
print "session id: 019d0ca5-87a0-73d3-a053-5dc7052efec9"
exec zsh -i
