#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154655744Z-a290e68c/codex-reflection.prompt.txt'
SESSION_ID='019d0bed-a1d6-7d91-a47b-7b754592a03a'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-154655744Z-a290e68c"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154655744Z-a290e68c"
print "session id: 019d0bed-a1d6-7d91-a47b-7b754592a03a"
exec zsh -i
