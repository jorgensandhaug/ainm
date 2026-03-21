#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-133135201Z-a0449d7c/codex-score-reflection.prompt.txt'
SESSION_ID='019d1098-1de0-7200-a4f4-29eea7e6ef6c'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-21-133135201Z-a0449d7c"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-133135201Z-a0449d7c"
print "session id: 019d1098-1de0-7200-a4f4-29eea7e6ef6c"
exec zsh -i
