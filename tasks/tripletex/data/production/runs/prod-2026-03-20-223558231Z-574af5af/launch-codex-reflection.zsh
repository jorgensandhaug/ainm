#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223558231Z-574af5af/codex-reflection.prompt.txt'
SESSION_ID='019d0d64-20c4-7b13-a575-ba9eda0ce73f'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-223558231Z-574af5af"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223558231Z-574af5af"
print "session id: 019d0d64-20c4-7b13-a575-ba9eda0ce73f"
exec zsh -i
