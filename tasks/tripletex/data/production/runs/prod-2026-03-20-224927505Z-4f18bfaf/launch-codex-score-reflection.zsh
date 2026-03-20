#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224927505Z-4f18bfaf/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d70-7adf-7180-9d1d-d361dd3f6e03'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-224927505Z-4f18bfaf"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224927505Z-4f18bfaf"
print "session id: 019d0d70-7adf-7180-9d1d-d361dd3f6e03"
exec zsh -i
