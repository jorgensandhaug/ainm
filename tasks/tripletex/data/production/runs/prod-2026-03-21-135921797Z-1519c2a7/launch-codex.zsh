#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-135921797Z-1519c2a7/codex-prompt.txt'

codex -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: prod-2026-03-21-135921797Z-1519c2a7"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-135921797Z-1519c2a7"
print "request file: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-135921797Z-1519c2a7/request.json"
exec zsh -i
