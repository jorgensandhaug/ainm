#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-133728286Z-82ff967a/codex-score-reflection.prompt.txt'
SESSION_ID='019d109d-88a3-71b3-a598-a9d44d87caf3'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-21-133728286Z-82ff967a"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-133728286Z-82ff967a"
print "session id: 019d109d-88a3-71b3-a598-a9d44d87caf3"
exec zsh -i
