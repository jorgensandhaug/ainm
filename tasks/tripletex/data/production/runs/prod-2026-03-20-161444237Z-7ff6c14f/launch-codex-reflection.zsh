#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-161444237Z-7ff6c14f/codex-reflection.prompt.txt'
SESSION_ID='019d0c07-189d-70b3-bc1d-a7d9ed4cd343'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-161444237Z-7ff6c14f"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-161444237Z-7ff6c14f"
print "session id: 019d0c07-189d-70b3-bc1d-a7d9ed4cd343"
exec zsh -i
