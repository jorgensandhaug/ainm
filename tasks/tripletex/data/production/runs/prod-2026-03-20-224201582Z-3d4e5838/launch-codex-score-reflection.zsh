#!/usr/bin/env zsh
set -u

cd '/home/jorge/repos/ainm/tasks/tripletex/codex-environment'

PROMPT_FILE='/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224201582Z-3d4e5838/codex-score-reflection.prompt.txt'
SESSION_ID='019d0d69-af04-7c90-90ea-19b71d5b2fb9'

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: prod-2026-03-20-224201582Z-3d4e5838"
print "run dir: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224201582Z-3d4e5838"
print "session id: 019d0d69-af04-7c90-90ea-19b71d5b2fb9"
exec zsh -i
