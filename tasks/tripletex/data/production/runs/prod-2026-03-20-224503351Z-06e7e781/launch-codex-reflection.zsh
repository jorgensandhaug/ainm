#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224503351Z-06e7e781/codex-reflection.prompt.txt'
SESSION_ID='019d0d6c-71d9-7133-99e2-f7bddbf2ed61'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-224503351Z-06e7e781"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224503351Z-06e7e781"
print "session id: 019d0d6c-71d9-7133-99e2-f7bddbf2ed61"
exec zsh -i
