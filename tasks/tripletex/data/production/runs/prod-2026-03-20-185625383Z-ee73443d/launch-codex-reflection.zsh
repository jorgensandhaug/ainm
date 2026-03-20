#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/codex-reflection.prompt.txt'
SESSION_ID='019d0c9b-1f45-7552-b575-e06711c14ba6'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-185625383Z-ee73443d"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d"
print "session id: 019d0c9b-1f45-7552-b575-e06711c14ba6"
exec zsh -i
