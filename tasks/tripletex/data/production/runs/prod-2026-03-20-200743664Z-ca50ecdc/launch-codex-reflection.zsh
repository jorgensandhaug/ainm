#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-200743664Z-ca50ecdc/codex-reflection.prompt.txt'
SESSION_ID='019d0cdc-6904-7173-bc75-6ce9de4f7ec1'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-200743664Z-ca50ecdc"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-200743664Z-ca50ecdc"
print "session id: 019d0cdc-6904-7173-bc75-6ce9de4f7ec1"
exec zsh -i
