#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184949556Z-a5fce89a/codex-reflection.prompt.txt'
SESSION_ID='019d0c95-14a7-7bb0-81f3-4a0670600694'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-184949556Z-a5fce89a"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184949556Z-a5fce89a"
print "session id: 019d0c95-14a7-7bb0-81f3-4a0670600694"
exec zsh -i
