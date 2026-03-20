#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150026580Z-cd6b831a/codex-reflection.prompt.txt'
SESSION_ID='019d0bc3-1420-7d60-8fd8-028cff4505fa'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-150026580Z-cd6b831a"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150026580Z-cd6b831a"
print "session id: 019d0bc3-1420-7d60-8fd8-028cff4505fa"
exec zsh -i
