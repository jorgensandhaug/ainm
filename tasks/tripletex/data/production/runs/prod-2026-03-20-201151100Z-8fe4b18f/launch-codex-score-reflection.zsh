#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-201151100Z-8fe4b18f/codex-score-reflection.prompt.txt'
SESSION_ID='019d0ce0-2d79-7dc1-b515-ce1ce4e1c2fb'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-201151100Z-8fe4b18f"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-201151100Z-8fe4b18f"
print "session id: 019d0ce0-2d79-7dc1-b515-ce1ce4e1c2fb"
exec zsh -i
