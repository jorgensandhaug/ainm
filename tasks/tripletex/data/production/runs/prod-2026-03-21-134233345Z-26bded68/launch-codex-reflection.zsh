#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/codex-reflection.prompt.txt'
SESSION_ID='019d10a2-2901-7273-89b7-99c2a5e3d157'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-21-134233345Z-26bded68"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68"
print "session id: 019d10a2-2901-7273-89b7-99c2a5e3d157"
exec zsh -i
