#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225634562Z-b827fef9/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d77-026b-7112-bd14-a96f09ef6522'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-225634562Z-b827fef9"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225634562Z-b827fef9"
print "session id: 019d0d77-026b-7112-bd14-a96f09ef6522"
exec zsh -i
