#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-133135201Z-a0449d7c/codex-prompt.txt'

codex -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: prod-2026-03-21-133135201Z-a0449d7c"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-133135201Z-a0449d7c"
print "request file: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-133135201Z-a0449d7c/request.json"
exec zsh -i
