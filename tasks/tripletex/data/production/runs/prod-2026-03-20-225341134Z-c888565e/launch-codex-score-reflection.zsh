#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225341134Z-c888565e/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d74-5962-7e22-aad6-21d53fdb6d4e'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-225341134Z-c888565e"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225341134Z-c888565e"
print "session id: 019d0d74-5962-7e22-aad6-21d53fdb6d4e"
exec zsh -i
