#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-161635045Z-902cdde6/codex-reflection.prompt.txt'
SESSION_ID='019d0c08-cca1-79d3-825c-1d5ff6caed28'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-161635045Z-902cdde6"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-161635045Z-902cdde6"
print "session id: 019d0c08-cca1-79d3-825c-1d5ff6caed28"
exec zsh -i
