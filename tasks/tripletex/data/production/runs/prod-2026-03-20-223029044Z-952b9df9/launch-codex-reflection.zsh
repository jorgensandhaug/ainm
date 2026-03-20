#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223029044Z-952b9df9/codex-reflection.prompt.txt'
SESSION_ID='019d0d5f-1bba-79a3-9f69-4338e6c7cdeb'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-223029044Z-952b9df9"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223029044Z-952b9df9"
print "session id: 019d0d5f-1bba-79a3-9f69-4338e6c7cdeb"
exec zsh -i
