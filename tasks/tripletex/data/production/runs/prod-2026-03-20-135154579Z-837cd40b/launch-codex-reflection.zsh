#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/codex-reflection.prompt.txt'
SESSION_ID='019d0b84-53ea-7401-9052-ce5474462f13'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-135154579Z-837cd40b"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b"
print "session id: 019d0b84-53ea-7401-9052-ce5474462f13"
exec zsh -i
