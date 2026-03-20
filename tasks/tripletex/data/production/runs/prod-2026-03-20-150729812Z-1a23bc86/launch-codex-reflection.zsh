#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150729812Z-1a23bc86/codex-reflection.prompt.txt'
SESSION_ID='019d0bc9-8af9-7b82-b6bf-b7e6f2229fd1'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-150729812Z-1a23bc86"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150729812Z-1a23bc86"
print "session id: 019d0bc9-8af9-7b82-b6bf-b7e6f2229fd1"
exec zsh -i
