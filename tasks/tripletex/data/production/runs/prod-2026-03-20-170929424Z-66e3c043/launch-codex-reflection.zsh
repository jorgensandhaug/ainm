#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-170929424Z-66e3c043/codex-reflection.prompt.txt'
SESSION_ID='019d0c39-38b1-74b0-bfff-66fe0013a734'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-170929424Z-66e3c043"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-170929424Z-66e3c043"
print "session id: 019d0c39-38b1-74b0-bfff-66fe0013a734"
exec zsh -i
