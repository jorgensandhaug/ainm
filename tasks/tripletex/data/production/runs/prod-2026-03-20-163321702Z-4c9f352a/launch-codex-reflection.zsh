#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163321702Z-4c9f352a/codex-reflection.prompt.txt'
SESSION_ID='019d0c18-2494-7232-97ff-3557c8abb511'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-163321702Z-4c9f352a"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163321702Z-4c9f352a"
print "session id: 019d0c18-2494-7232-97ff-3557c8abb511"
exec zsh -i
