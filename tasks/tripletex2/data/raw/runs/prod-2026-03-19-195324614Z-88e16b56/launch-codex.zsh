#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-195324614Z-88e16b56/codex-prompt.txt'

codex --yolo --no-alt-screen "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: prod-2026-03-19-195324614Z-88e16b56"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-195324614Z-88e16b56"
print "request file: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-195324614Z-88e16b56/request.json"
exec zsh -i
