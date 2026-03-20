#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154043711Z-89cff08b/codex-reflection.prompt.txt'
SESSION_ID='019d0be7-f487-7cb0-b4d3-02c9d89e0816'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-154043711Z-89cff08b"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154043711Z-89cff08b"
print "session id: 019d0be7-f487-7cb0-b4d3-02c9d89e0816"
exec zsh -i
