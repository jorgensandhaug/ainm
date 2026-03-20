#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163122837Z-479d120a/codex-reflection.prompt.txt'
SESSION_ID='019d0c16-5458-7e12-92e8-9c531effbc99'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-163122837Z-479d120a"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163122837Z-479d120a"
print "session id: 019d0c16-5458-7e12-92e8-9c531effbc99"
exec zsh -i
