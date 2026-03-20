#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/codex-reflection.prompt.txt'
SESSION_ID='019d0d47-21c4-7242-aee3-602a7cf340ff'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-220416308Z-5452345a"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a"
print "session id: 019d0d47-21c4-7242-aee3-602a7cf340ff"
exec zsh -i
