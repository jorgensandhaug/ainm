#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-191309835Z-25dbb910/codex-reflection.prompt.txt'
SESSION_ID='019d0caa-78d8-70b2-b8c9-c2c0f0907f8c'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-191309835Z-25dbb910"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-191309835Z-25dbb910"
print "session id: 019d0caa-78d8-70b2-b8c9-c2c0f0907f8c"
exec zsh -i
