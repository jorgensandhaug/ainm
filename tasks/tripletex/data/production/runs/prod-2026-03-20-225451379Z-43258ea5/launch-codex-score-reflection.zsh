#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225451379Z-43258ea5/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d75-6a83-7132-b0b3-2cc2b29f25bb'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-225451379Z-43258ea5"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-225451379Z-43258ea5"
print "session id: 019d0d75-6a83-7132-b0b3-2cc2b29f25bb"
exec zsh -i
