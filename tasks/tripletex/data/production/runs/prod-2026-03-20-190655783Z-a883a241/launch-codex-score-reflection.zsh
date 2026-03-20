#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190655783Z-a883a241/codex-score-reflection.prompt.txt'
SESSION_ID='019d0ca4-bfa6-7d51-b1ed-11c8302c6baf'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-190655783Z-a883a241"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190655783Z-a883a241"
print "session id: 019d0ca4-bfa6-7d51-b1ed-11c8302c6baf"
exec zsh -i
