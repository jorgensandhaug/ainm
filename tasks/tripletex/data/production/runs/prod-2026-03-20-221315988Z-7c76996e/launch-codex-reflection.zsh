#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221315988Z-7c76996e/codex-reflection.prompt.txt'
SESSION_ID='019d0d4f-5742-7832-b280-687b75d3cdab'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-221315988Z-7c76996e"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221315988Z-7c76996e"
print "session id: 019d0d4f-5742-7832-b280-687b75d3cdab"
exec zsh -i
