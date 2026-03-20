#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154935427Z-95749a07/codex-reflection.prompt.txt'
SESSION_ID='019d0bf0-1402-7bc1-82c6-1073feff91e6'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-154935427Z-95749a07"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154935427Z-95749a07"
print "session id: 019d0bf0-1402-7bc1-82c6-1073feff91e6"
exec zsh -i
