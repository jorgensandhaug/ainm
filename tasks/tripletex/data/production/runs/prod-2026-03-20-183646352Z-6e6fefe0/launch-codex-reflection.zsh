#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183646352Z-6e6fefe0/codex-reflection.prompt.txt'
SESSION_ID='019d0c89-2326-71a1-9a82-0b451074a8fa'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-183646352Z-6e6fefe0"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183646352Z-6e6fefe0"
print "session id: 019d0c89-2326-71a1-9a82-0b451074a8fa"
exec zsh -i
