#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225604112Z-efea1fcf/codex-reflection.prompt.txt'
SESSION_ID='019d0d76-86f7-7903-8946-70a2db00804c'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-225604112Z-efea1fcf"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225604112Z-efea1fcf"
print "session id: 019d0d76-86f7-7903-8946-70a2db00804c"
exec zsh -i
