#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134807272Z-87850872/codex-score-reflection.prompt.txt'
SESSION_ID='019d10a7-5aa6-7d70-99be-030374cea323'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-21-134807272Z-87850872"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134807272Z-87850872"
print "session id: 019d10a7-5aa6-7d70-99be-030374cea323"
exec zsh -i
