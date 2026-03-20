#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222816328Z-0b339baa/codex-reflection.prompt.txt'
SESSION_ID='019d0d5d-15f3-76a2-a5a3-71313721d874'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-222816328Z-0b339baa"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222816328Z-0b339baa"
print "session id: 019d0d5d-15f3-76a2-a5a3-71313721d874"
exec zsh -i
