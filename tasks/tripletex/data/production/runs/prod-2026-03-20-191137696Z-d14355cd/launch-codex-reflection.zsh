#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-191137696Z-d14355cd/codex-reflection.prompt.txt'
SESSION_ID='019d0ca9-0a8f-77a2-a857-ba59b069d4ba'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-191137696Z-d14355cd"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-191137696Z-d14355cd"
print "session id: 019d0ca9-0a8f-77a2-a857-ba59b069d4ba"
exec zsh -i
