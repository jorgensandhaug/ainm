#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225430188Z-7f899dff/codex-reflection.prompt.txt'
SESSION_ID='019d0d75-1897-7c22-ae16-03ece5af38bd'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-225430188Z-7f899dff"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225430188Z-7f899dff"
print "session id: 019d0d75-1897-7c22-ae16-03ece5af38bd"
exec zsh -i
