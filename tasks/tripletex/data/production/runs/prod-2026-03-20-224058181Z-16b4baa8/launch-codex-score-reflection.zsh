#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224058181Z-16b4baa8/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d68-b4d1-7811-b50c-0b7b1e435c79'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-224058181Z-16b4baa8"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224058181Z-16b4baa8"
print "session id: 019d0d68-b4d1-7811-b50c-0b7b1e435c79"
exec zsh -i
