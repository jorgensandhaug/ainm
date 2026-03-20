#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225040646Z-e90cdedf/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d71-a0b8-7ce3-a8b6-573dc9a02734'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-225040646Z-e90cdedf"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225040646Z-e90cdedf"
print "session id: 019d0d71-a0b8-7ce3-a8b6-573dc9a02734"
exec zsh -i
